/**
 * PitchPulseStack — single stack containing the entire AWS surface:
 *
 *   DynamoDB
 *     pp-users    — PROFILE: tier, titles, weeklyPoints, seasonalPoints, season metadata
 *     pp-leaderboards — weekly + seasonal leaderboard rows (PointsRankIndex GSI)
 *     pp-matches  — CLOCK + EVENT items; Streams → stream-handler Lambda
 *     pp-prompts  — prompt META + VOTE items, TTL on expiresAt
 *     pp-rooms    — Watch Room META/MEMBER/COMMENT/REACTION items + InviteCode GSI
 *
 *   Lambda
 *     sim-emitter    — reads XML from S3, advances match-time, writes EVENTs
 *     start-match    — flips CLOCK isRunning=true + async-invokes sim-emitter
 *     stream-handler — DDB Stream → AppSync publishMatchClock/Event mutations
 *
 *   AppSync
 *     GraphqlApi (IAM auth) with the schema from cdk/schema/schema.graphql.
 *     Data sources: NONE, DDB(pp-rooms), DDB(pp-prompts), Lambda(start-match).
 *     JS resolvers (APPSYNC_JS runtime 1.0.0) for each mutation.
 *
 *   EventBridge
 *     rate(1 minute) cron firing sim-emitter as a safety net (the actual
 *     2-second match-tick cadence runs inside the Lambda invocation loop).
 *
 *   Cognito
 *     User Pool with the demo accounts alice, bob and operator (group
 *     "operators"), sharing one password read from SSM at deploy time.
 *     Clients call AppSync with an ID token via the AWS_LAMBDA authorizer;
 *     there is no anonymous access. Server Lambdas use IAM.
 *
 * Hackathon-data S3 bucket access:
 *   The sim-emitter Lambda reads two specific objects out of the existing
 *   hackathon-data-058755927272 bucket on cold start. The bucket itself is
 *   NOT managed by this stack — we attach a read-only policy scoped to the
 *   two keys only.
 */

import * as path from 'node:path';
import {
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  CfnOutput,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEvents from 'aws-cdk-lib/aws-lambda-event-sources';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { CustomResource } from 'aws-cdk-lib';

// ─── Hackathon constants ───────────────────────────────────────────────────

const HACKATHON_DATA_BUCKET = 'hackathon-data-058755927272';
// NB: matches the actual S3 layout discovered in Gate 0 (note the en-dash in
// "Challenge 3 – ..."). Anchored in .env.example for consistency.
const MATCH_EVENTS_KEY = 'Challenge 3 – A Real Time Social Match Experience/data/Match-Events/Events_Anonym.xml';
const MATCH_INFO_KEY = 'Challenge 3 – A Real Time Social Match Experience/data/Match-Events/MatchInformations_Anonym.xml';
const MATCH_ID = 'DFL-MAT-000001';
const SEASON_WEEKS = '8';
/** SSM SecureString holding the shared demo password. Create it before deploying. */
const DEFAULT_DEMO_PASSWORD_PARAM = '/pitchpulse/demo-password';
const OPERATORS_GROUP = 'operators';
const DEMO_USERS = [
  { username: 'alice', name: 'Alice', groups: [] as string[] },
  { username: 'bob', name: 'Bob', groups: [] as string[] },
  { username: 'operator', name: 'Match operator', groups: [OPERATORS_GROUP] },
];

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CDK_ROOT = path.resolve(__dirname, '..');

export class PitchPulseStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // ─── DynamoDB tables ───────────────────────────────────────────────

    // Generic single-table-style schema: PK + SK strings, on-demand billing.
    // RETAIN policy is overkill for a hackathon — explicit DESTROY so cdk
    // destroy actually cleans the account.
    const ddbCommon = {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    } as const;

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      ...ddbCommon,
      tableName: 'pp-users',
    });

    const matchesTable = new dynamodb.Table(this, 'MatchesTable', {
      ...ddbCommon,
      tableName: 'pp-matches',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    const promptsTable = new dynamodb.Table(this, 'PromptsTable', {
      ...ddbCommon,
      tableName: 'pp-prompts',
      timeToLiveAttribute: 'expiresAt',
    });

    const roomsTable = new dynamodb.Table(this, 'RoomsTable', {
      ...ddbCommon,
      tableName: 'pp-rooms',
      timeToLiveAttribute: 'expiresAt',
    });
    // Sparse GSI — only META rows carry inviteCode for joinRoom lookup.
    roomsTable.addGlobalSecondaryIndex({
      indexName: 'InviteCodeIndex',
      partitionKey: { name: 'inviteCode', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const leaderboardsTable = new dynamodb.Table(this, 'LeaderboardsTable', {
      ...ddbCommon,
      tableName: 'pp-leaderboards',
    });
    leaderboardsTable.addGlobalSecondaryIndex({
      indexName: 'PointsRankIndex',
      partitionKey: { name: 'periodKey', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'points', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─── Lambda functions ──────────────────────────────────────────────

    // Shared NodejsFunction defaults: Node 20, ESM-friendly bundle, tight
    // log retention (cost), short timeout where possible.
    const fnDefaults: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node20',
        externalModules: ['@aws-sdk/*'], // SDK v3 is provided by the runtime
      },
    };

    const simEmitterFn = new lambdaNodejs.NodejsFunction(this, 'SimEmitterFn', {
      ...fnDefaults,
      functionName: 'pp-sim-emitter',
      entry: path.join(CDK_ROOT, 'lambda', 'sim-emitter', 'index.ts'),
      handler: 'handler',
      // Match at SIM_RATE=30 plays in ~184 real seconds. Lambda loops for up
      // to LOOP_MAX_MS=220s so a single invocation covers the entire match —
      // avoids any visible gap between Lambda exits and EventBridge re-fires.
      timeout: Duration.seconds(240),
      memorySize: 512,
      // Pin to exactly 1 concurrent invocation. Without this, the manual
      // invoke triggered by start-match races the EventBridge 1-minute
      // safety-net cron — both Lambdas read the same lastEmittedSeq from
      // CLOCK and re-emit the same events with different emittedAt
      // timestamps, which the frontend then has to dedupe. Reserving 1
      // serializes everything; queued cron invokes simply run once the
      // current handler finishes (~55s loop).
      reservedConcurrentExecutions: 1,
      environment: {
        HACKATHON_DATA_BUCKET,
        MATCH_EVENTS_KEY,
        MATCH_INFO_KEY,
        MATCHES_TABLE: matchesTable.tableName,
        MATCH_ID,
        SIM_RATE: '30',
      },
    });
    matchesTable.grantReadWriteData(simEmitterFn);
    // s3:GetObject scoped to the Match-Events folder. IAM policy documents
    // reject non-ASCII bytes, and the actual S3 keys contain a UTF-8 en-dash
    // (in "Challenge 3 – ..."), so we use an ASCII wildcard prefix here
    // instead of listing the two specific keys. Both file names are passed
    // to the Lambda via environment variables, so the runtime still reads
    // only those two objects.
    simEmitterFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [`arn:aws:s3:::${HACKATHON_DATA_BUCKET}/*`],
      }),
    );

    const startMatchFn = new lambdaNodejs.NodejsFunction(this, 'StartMatchFn', {
      ...fnDefaults,
      functionName: 'pp-start-match',
      entry: path.join(CDK_ROOT, 'lambda', 'start-match', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        MATCHES_TABLE: matchesTable.tableName,
        SIM_EMITTER_FN: simEmitterFn.functionName,
      },
    });
    matchesTable.grantReadWriteData(startMatchFn);
    simEmitterFn.grantInvoke(startMatchFn);

    const streamHandlerFn = new lambdaNodejs.NodejsFunction(this, 'StreamHandlerFn', {
      ...fnDefaults,
      functionName: 'pp-stream-handler',
      entry: path.join(CDK_ROOT, 'lambda', 'stream-handler', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      // APPSYNC_URL added below once the API exists.
    });

    // Wire pp-matches Stream → stream-handler. Small batches so each event
    // gets broadcast with minimal latency.
    streamHandlerFn.addEventSource(
      new lambdaEvents.DynamoEventSource(matchesTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(1),
        retryAttempts: 2,
        bisectBatchOnError: false,
      }),
    );

    const roomHandlerFn = new lambdaNodejs.NodejsFunction(this, 'RoomHandlerFn', {
      ...fnDefaults,
      functionName: 'pp-room-handler',
      entry: path.join(CDK_ROOT, 'lambda', 'room-handler', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: {
        ROOMS_TABLE: roomsTable.tableName,
      },
    });
    roomsTable.grantReadWriteData(roomHandlerFn);

    const rankedHandlerFn = new lambdaNodejs.NodejsFunction(this, 'RankedHandlerFn', {
      ...fnDefaults,
      functionName: 'pp-ranked-handler',
      entry: path.join(CDK_ROOT, 'lambda', 'ranked-handler', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
        LEADERBOARDS_TABLE: leaderboardsTable.tableName,
        SEASON_WEEKS,
        // APPSYNC_URL added below once the API exists.
      },
    });
    usersTable.grantReadWriteData(rankedHandlerFn);
    leaderboardsTable.grantReadWriteData(rankedHandlerFn);

    const leaderboardHandlerFn = new lambdaNodejs.NodejsFunction(this, 'LeaderboardHandlerFn', {
      ...fnDefaults,
      functionName: 'pp-leaderboard-handler',
      entry: path.join(CDK_ROOT, 'lambda', 'leaderboard-handler', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
        LEADERBOARDS_TABLE: leaderboardsTable.tableName,
        SEASON_WEEKS,
      },
    });
    usersTable.grantReadData(leaderboardHandlerFn);
    leaderboardsTable.grantReadData(leaderboardHandlerFn);

    const voteHandlerFn = new lambdaNodejs.NodejsFunction(this, 'VoteHandlerFn', {
      ...fnDefaults,
      functionName: 'pp-vote-handler',
      entry: path.join(CDK_ROOT, 'lambda', 'vote-handler', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        PROMPTS_TABLE: promptsTable.tableName,
      },
    });
    promptsTable.grantReadWriteData(voteHandlerFn);

    const weeklyResetFn = new lambdaNodejs.NodejsFunction(this, 'WeeklyResetFn', {
      ...fnDefaults,
      functionName: 'pp-weekly-reset',
      entry: path.join(CDK_ROOT, 'lambda', 'weekly-reset', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(60),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
    });
    usersTable.grantReadWriteData(weeklyResetFn);

    const seasonResetFn = new lambdaNodejs.NodejsFunction(this, 'SeasonResetFn', {
      ...fnDefaults,
      functionName: 'pp-season-reset',
      entry: path.join(CDK_ROOT, 'lambda', 'season-reset', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(60),
      memorySize: 256,
      environment: {
        USERS_TABLE: usersTable.tableName,
      },
    });
    usersTable.grantReadWriteData(seasonResetFn);

    // ─── Cognito User Pool + demo accounts ─────────────────────────────

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'pitchpulse-demo',
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      passwordPolicy: { minLength: 12, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userPassword: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(1),
    });
    new cognito.CfnUserPoolGroup(this, 'OperatorsGroup', {
      userPoolId: userPool.userPoolId,
      groupName: OPERATORS_GROUP,
      description: 'May start and reset the shared match clock.',
    });

    const demoPasswordParam =
      (this.node.tryGetContext('demoPasswordParam') as string | undefined) ??
      DEFAULT_DEMO_PASSWORD_PARAM;

    const demoUsersFn = new lambdaNodejs.NodejsFunction(this, 'DemoUsersFn', {
      ...fnDefaults,
      functionName: 'pp-demo-users',
      entry: path.join(CDK_ROOT, 'lambda', 'demo-users', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
    });
    demoUsersFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminAddUserToGroup',
        ],
        resources: [userPool.userPoolArn],
      }),
    );
    demoUsersFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/${demoPasswordParam.replace(/^\//, '')}`,
        ],
      }),
    );
    const demoUsers = new CustomResource(this, 'DemoUsers', {
      serviceToken: new cr.Provider(this, 'DemoUsersProvider', { onEventHandler: demoUsersFn })
        .serviceToken,
      properties: {
        UserPoolId: userPool.userPoolId,
        PasswordParameterName: demoPasswordParam,
        Users: JSON.stringify(DEMO_USERS),
        // Re-run on every deploy so a rotated SSM value takes effect.
        Nonce: Date.now().toString(),
      },
    });
    demoUsers.node.addDependency(userPool);

    const authorizerFn = new lambdaNodejs.NodejsFunction(this, 'AuthorizerFn', {
      ...fnDefaults,
      functionName: 'pp-authorizer',
      entry: path.join(CDK_ROOT, 'lambda', 'authorizer', 'index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(5),
      memorySize: 256,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // ─── AppSync GraphQL API ───────────────────────────────────────────

    const api = new appsync.GraphqlApi(this, 'Api', {
      name: 'pitchpulse',
      definition: appsync.Definition.fromFile(
        path.join(CDK_ROOT, 'schema', 'schema.graphql'),
      ),
      authorizationConfig: {
        // IAM: server Lambdas only (per-field grants below).
        defaultAuthorization: { authorizationType: appsync.AuthorizationType.IAM },
        // Clients: Cognito ID token verified by lambda/authorizer.
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.LAMBDA,
            lambdaAuthorizerConfig: {
              handler: authorizerFn,
              resultsCacheTtl: Duration.minutes(5),
            },
          },
        ],
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
        retention: logs.RetentionDays.ONE_WEEK,
      },
      xrayEnabled: false,
    });

    // Now that the API exists, plumb its URL into server-side broadcast Lambdas.
    streamHandlerFn.addEnvironment('APPSYNC_URL', api.graphqlUrl);
    rankedHandlerFn.addEnvironment('APPSYNC_URL', api.graphqlUrl);
    // stream-handler is IAM-allowed to invoke just the two publish mutations.
    streamHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [
          `${api.arn}/types/Mutation/fields/publishMatchClock`,
          `${api.arn}/types/Mutation/fields/publishMatchEvent`,
        ],
      }),
    );

    rankedHandlerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [
          `${api.arn}/types/Mutation/fields/publishLeaderboardUpdated`,
          `${api.arn}/types/Mutation/fields/notifyTitleUnlocked`,
          `${api.arn}/types/Mutation/fields/notifyTierPromoted`,
        ],
      }),
    );

    // ─── AppSync data sources ──────────────────────────────────────────

    const noneDS = api.addNoneDataSource('NoneDS');
    const promptsDS = api.addDynamoDbDataSource('PromptsDS', promptsTable);
    const startMatchDS = api.addLambdaDataSource('StartMatchDS', startMatchFn);
    const roomHandlerDS = api.addLambdaDataSource('RoomHandlerDS', roomHandlerFn);
    const rankedHandlerDS = api.addLambdaDataSource('RankedHandlerDS', rankedHandlerFn);
    const leaderboardHandlerDS = api.addLambdaDataSource('LeaderboardHandlerDS', leaderboardHandlerFn);
    const voteHandlerDS = api.addLambdaDataSource('VoteHandlerDS', voteHandlerFn);

    // ─── AppSync resolvers ─────────────────────────────────────────────

    const resolverRoot = path.join(CDK_ROOT, 'resolvers');
    const jsRuntime = appsync.FunctionRuntime.JS_1_0_0;

    noneDS.createResolver('PublishMatchClockResolver', {
      typeName: 'Mutation',
      fieldName: 'publishMatchClock',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'publishMatchClock.js')),
    });

    noneDS.createResolver('PublishMatchEventResolver', {
      typeName: 'Mutation',
      fieldName: 'publishMatchEvent',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'publishMatchEvent.js')),
    });

    // In room-handler (not a DynamoDB resolver) so it can check membership.
    roomHandlerDS.createResolver('FireReactionResolver', {
      typeName: 'Mutation',
      fieldName: 'fireReaction',
    });

    voteHandlerDS.createResolver('SubmitVoteResolver', {
      typeName: 'Mutation',
      fieldName: 'submitVote',
    });
    voteHandlerDS.createResolver('SignalHotTakeResolver', {
      typeName: 'Mutation',
      fieldName: 'signalHotTake',
    });
    voteHandlerDS.createResolver('InitRankedHotTakeResolver', {
      typeName: 'Mutation',
      fieldName: 'initRankedHotTake',
    });

    // Lambda data sources don't use JS resolvers — they wire mutation args
    // directly into the Lambda payload via the default direct-Lambda mapping.
    startMatchDS.createResolver('StartMatchResolver', {
      typeName: 'Mutation',
      fieldName: 'startMatch',
    });
    startMatchDS.createResolver('ResetMatchResolver', {
      typeName: 'Mutation',
      fieldName: 'resetMatch',
    });

    roomHandlerDS.createResolver('CreateRoomResolver', {
      typeName: 'Mutation',
      fieldName: 'createRoom',
    });
    roomHandlerDS.createResolver('JoinRoomResolver', {
      typeName: 'Mutation',
      fieldName: 'joinRoom',
    });
    roomHandlerDS.createResolver('PostCommentResolver', {
      typeName: 'Mutation',
      fieldName: 'postComment',
    });
    roomHandlerDS.createResolver('LeaveRoomResolver', {
      typeName: 'Mutation',
      fieldName: 'leaveRoom',
    });

    noneDS.createResolver('PublishRoomLeaderboardResolver', {
      typeName: 'Mutation',
      fieldName: 'publishRoomLeaderboard',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'publishRoomLeaderboard.js')),
    });

    rankedHandlerDS.createResolver('FindRankedMatchResolver', {
      typeName: 'Mutation',
      fieldName: 'findRankedMatch',
    });
    rankedHandlerDS.createResolver('LockInRankedMatchResolver', {
      typeName: 'Mutation',
      fieldName: 'lockInRankedMatch',
    });
    rankedHandlerDS.createResolver('RankedMatchdayStatusResolver', {
      typeName: 'Query',
      fieldName: 'rankedMatchdayStatus',
    });
    rankedHandlerDS.createResolver('EquipTitleResolver', {
      typeName: 'Mutation',
      fieldName: 'equipTitle',
    });
    rankedHandlerDS.createResolver('UnlockHotTakeHeroResolver', {
      typeName: 'Mutation',
      fieldName: 'unlockHotTakeHero',
    });
    rankedHandlerDS.createResolver('CompleteRankedMatchResolver', {
      typeName: 'Mutation',
      fieldName: 'completeRankedMatch',
    });

    noneDS.createResolver('NotifyTierPromotedResolver', {
      typeName: 'Mutation',
      fieldName: 'notifyTierPromoted',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'notifyTierPromoted.js')),
    });

    noneDS.createResolver('NotifyTitleUnlockedResolver', {
      typeName: 'Mutation',
      fieldName: 'notifyTitleUnlocked',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'notifyTitleUnlocked.js')),
    });

    noneDS.createResolver('PublishLeaderboardUpdatedResolver', {
      typeName: 'Mutation',
      fieldName: 'publishLeaderboardUpdated',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'publishLeaderboardUpdated.js')),
    });

    leaderboardHandlerDS.createResolver('WeeklyLeaderboardResolver', {
      typeName: 'Query',
      fieldName: 'weeklyLeaderboard',
    });
    leaderboardHandlerDS.createResolver('SeasonalLeaderboardResolver', {
      typeName: 'Query',
      fieldName: 'seasonalLeaderboard',
    });
    leaderboardHandlerDS.createResolver('UserStatsResolver', {
      typeName: 'Query',
      fieldName: 'userStats',
    });

    // ─── EventBridge cron (safety-net for sim-emitter loop) ────────────

    new events.Rule(this, 'SimEmitterCron', {
      ruleName: 'pp-sim-emitter-tick',
      description: 'Keeps sim-emitter alive; the in-Lambda loop handles the actual 2-second cadence.',
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new eventsTargets.LambdaFunction(simEmitterFn)],
    });

    new events.Rule(this, 'WeeklyResetCron', {
      ruleName: 'pp-weekly-reset',
      description: 'Resets weeklyPoints every Monday 00:00 CET (Sunday 23:00 UTC).',
      schedule: events.Schedule.cron({ minute: '0', hour: '23', weekDay: 'SUN' }),
      targets: [new eventsTargets.LambdaFunction(weeklyResetFn)],
    });

    new events.Rule(this, 'SeasonResetCron', {
      ruleName: 'pp-season-reset',
      description: 'Season reset — far-future cron for demo; invoke manually to test.',
      schedule: events.Schedule.cron({ minute: '0', hour: '0', day: '1', month: '1', year: '2099' }),
      targets: [new eventsTargets.LambdaFunction(seasonResetFn)],
    });

    // ─── Outputs (consumed by the frontend's .env.production) ──────────

    new CfnOutput(this, 'AppSyncGraphQLUrl', {
      value: api.graphqlUrl,
      description: 'AppSync GraphQL endpoint URL (HTTPS for mutations/queries).',
    });
    new CfnOutput(this, 'AppSyncRealtimeUrl', {
      value: api.graphqlUrl.replace('https://', 'wss://').replace('appsync-api', 'appsync-realtime-api'),
      description: 'AppSync real-time (WebSocket) URL - derived; Amplify infers this automatically.',
    });
    new CfnOutput(this, 'AppSyncApiId', { value: api.apiId });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Frontend VITE_COGNITO_USER_POOL_CLIENT_ID.',
    });
    new CfnOutput(this, 'DemoPasswordParameter', {
      value: demoPasswordParam,
      description: 'SSM SecureString with the shared demo password (set by the deployer).',
    });
    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'MatchId', { value: MATCH_ID });
    new CfnOutput(this, 'SeasonWeeks', { value: SEASON_WEEKS });

    void promptsTable;
  }
}
