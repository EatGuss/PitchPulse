/**
 * PitchPulseStack — single stack containing the entire AWS surface:
 *
 *   DynamoDB
 *     pp-users    — coin balances, streaks, badge unlocks, ranked tier/title state (no Streams)
 *                   PROFILE: tier, tierWinsTowardNext, totalShots, correctShots,
 *                   rankedMatchesPlayed, lifetimeAccuracy, equippedTitleId, unlockedTitles
 *                   TITLE_PROGRESS#<titleId>: per-title progress for locked titles
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
 *     Identity Pool with anonymous access. Unauthenticated role granted
 *     appsync:GraphQL on the client-callable mutations + subscriptions.
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
  Expiration,
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

// ─── Hackathon constants ───────────────────────────────────────────────────

const HACKATHON_DATA_BUCKET = 'hackathon-data-058755927272';
// NB: matches the actual S3 layout discovered in Gate 0 (note the en-dash in
// "Challenge 3 – ..."). Anchored in .env.example for consistency.
const MATCH_EVENTS_KEY = 'Challenge 3 – A Real Time Social Match Experience/data/Match-Events/Events_Anonym.xml';
const MATCH_INFO_KEY = 'Challenge 3 – A Real Time Social Match Experience/data/Match-Events/MatchInformations_Anonym.xml';
const MATCH_ID = 'DFL-MAT-000001';

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
      timeout: Duration.seconds(60), // > LOOP_MAX_MS (55s) inside the handler
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
      },
    });
    usersTable.grantReadWriteData(rankedHandlerFn);

    // ─── AppSync GraphQL API ───────────────────────────────────────────

    const api = new appsync.GraphqlApi(this, 'Api', {
      name: 'pitchpulse',
      definition: appsync.Definition.fromFile(
        path.join(CDK_ROOT, 'schema', 'schema.graphql'),
      ),
      authorizationConfig: {
        defaultAuthorization: { authorizationType: appsync.AuthorizationType.IAM },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.API_KEY,
            apiKeyConfig: {
              description: 'Console / debugging key (NOT used by the frontend).',
              expires: Expiration.after(Duration.days(365)),
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

    // Now that the API exists, plumb its URL into the stream-handler.
    streamHandlerFn.addEnvironment('APPSYNC_URL', api.graphqlUrl);
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

    // ─── AppSync data sources ──────────────────────────────────────────

    const noneDS = api.addNoneDataSource('NoneDS');
    const roomsDS = api.addDynamoDbDataSource('RoomsDS', roomsTable);
    const promptsDS = api.addDynamoDbDataSource('PromptsDS', promptsTable);
    const startMatchDS = api.addLambdaDataSource('StartMatchDS', startMatchFn);
    const roomHandlerDS = api.addLambdaDataSource('RoomHandlerDS', roomHandlerFn);
    const rankedHandlerDS = api.addLambdaDataSource('RankedHandlerDS', rankedHandlerFn);

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

    roomsDS.createResolver('FireReactionResolver', {
      typeName: 'Mutation',
      fieldName: 'fireReaction',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'fireReaction.js')),
    });

    promptsDS.createResolver('SubmitVoteResolver', {
      typeName: 'Mutation',
      fieldName: 'submitVote',
      runtime: jsRuntime,
      code: appsync.Code.fromAsset(path.join(resolverRoot, 'submitVote.js')),
    });

    // Lambda data sources don't use JS resolvers — they wire mutation args
    // directly into the Lambda payload via the default direct-Lambda mapping.
    startMatchDS.createResolver('StartMatchResolver', {
      typeName: 'Mutation',
      fieldName: 'startMatch',
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
    rankedHandlerDS.createResolver('EquipTitleResolver', {
      typeName: 'Mutation',
      fieldName: 'equipTitle',
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

    // ─── EventBridge cron (safety-net for sim-emitter loop) ────────────

    new events.Rule(this, 'SimEmitterCron', {
      ruleName: 'pp-sim-emitter-tick',
      description: 'Keeps sim-emitter alive; the in-Lambda loop handles the actual 2-second cadence.',
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [new eventsTargets.LambdaFunction(simEmitterFn)],
    });

    // ─── Cognito Identity Pool (anonymous access) ──────────────────────

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: 'pitchpulse_demo',
      allowUnauthenticatedIdentities: true,
      // No user pool: this is a pure anonymous-only pool. alice/bob are
      // distinguished client-side via a localStorage userId — they share the
      // same Cognito identity.
    });

    const unauthRole = new iam.Role(this, 'CognitoUnauthRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      description: 'Anonymous PitchPulse viewers - AppSync mutations + subscriptions only.',
    });

    unauthRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['appsync:GraphQL'],
        resources: [
          // Client-callable mutations
          `${api.arn}/types/Mutation/fields/startMatch`,
          `${api.arn}/types/Mutation/fields/fireReaction`,
          `${api.arn}/types/Mutation/fields/submitVote`,
          `${api.arn}/types/Mutation/fields/createRoom`,
          `${api.arn}/types/Mutation/fields/joinRoom`,
          `${api.arn}/types/Mutation/fields/postComment`,
          `${api.arn}/types/Mutation/fields/leaveRoom`,
          `${api.arn}/types/Mutation/fields/findRankedMatch`,
          `${api.arn}/types/Mutation/fields/equipTitle`,
          // Client-receivable subscriptions
          `${api.arn}/types/Subscription/fields/matchClock`,
          `${api.arn}/types/Subscription/fields/matchEvent`,
          `${api.arn}/types/Subscription/fields/roomReaction`,
          `${api.arn}/types/Subscription/fields/voteSubmitted`,
          `${api.arn}/types/Subscription/fields/roomMemberJoined`,
          `${api.arn}/types/Subscription/fields/roomComment`,
          `${api.arn}/types/Subscription/fields/roomLeaderboardUpdate`,
          `${api.arn}/types/Subscription/fields/tierPromoted`,
          `${api.arn}/types/Subscription/fields/titleUnlocked`,
          // Schema sanity check
          `${api.arn}/types/Query/fields/ping`,
        ],
      }),
    );

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoles', {
      identityPoolId: identityPool.ref,
      roles: { unauthenticated: unauthRole.roleArn },
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
    new CfnOutput(this, 'AppSyncApiKey', {
      value: api.apiKey ?? 'NONE',
      description: 'Console / debugging API key. NOT used by the frontend.',
    });
    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'MatchId', { value: MATCH_ID });

    void promptsTable;
  }
}
