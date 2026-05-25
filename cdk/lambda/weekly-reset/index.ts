/**
 * weeklyResetHandler — EventBridge cron (Sunday 23:00 UTC = Monday 00:00 CET).
 * Resets weeklyPoints on all PROFILE items and updates weeklyPointsResetAt.
 */

import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { nextMondayMidnightBerlinIso } from '../shared/periods';

const REGION = process.env.AWS_REGION ?? 'eu-central-1';
const USERS_TABLE = required('USERS_TABLE');

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const ddb = new DynamoDBClient({ region: REGION });

export const handler = async (): Promise<{ resetCount: number }> => {
  const nextReset = nextMondayMidnightBerlinIso();
  let resetCount = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const scan = await ddb.send(
      new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: 'SK = :profile',
        ExpressionAttributeValues: { ':profile': { S: 'PROFILE' } },
        ExclusiveStartKey: lastKey as never,
      }),
    );

    for (const item of scan.Items ?? []) {
      const row = unmarshall(item) as { PK: string; SK: string };
      await ddb.send(
        new UpdateItemCommand({
          TableName: USERS_TABLE,
          Key: { PK: { S: row.PK }, SK: { S: row.SK } },
          UpdateExpression: 'SET weeklyPoints = :zero, weeklyPointsResetAt = :next, updatedAt = :ts',
          ExpressionAttributeValues: {
            ':zero': { N: '0' },
            ':next': { S: nextReset },
            ':ts': { N: String(Date.now()) },
          },
        }),
      );
      resetCount += 1;
    }

    lastKey = scan.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(JSON.stringify({ msg: 'weekly-reset complete', resetCount, nextReset }));
  return { resetCount };
};
