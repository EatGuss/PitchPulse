/**
 * demo-users — CloudFormation custom resource that creates the demo accounts
 * (alice, bob, operator) in the user pool and sets their shared password.
 *
 * The password is read from an SSM SecureString at deploy time, so it never
 * appears in the template, the stack outputs or the frontend bundle. Runs on
 * every deploy (the stack passes a changing nonce) so rotating the SSM value
 * and redeploying rotates the password.
 */

import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { CloudFormationCustomResourceEvent } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});
const ssm = new SSMClient({});

interface DemoUser {
  username: string;
  name: string;
  groups: string[];
}

interface Props {
  UserPoolId: string;
  PasswordParameterName: string;
  Users: string; // JSON DemoUser[]
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  const physicalId = 'pitchpulse-demo-users';
  if (event.RequestType === 'Delete') return { PhysicalResourceId: physicalId };

  const props = event.ResourceProperties as unknown as Props;
  const users = JSON.parse(props.Users) as DemoUser[];
  const param = await ssm.send(
    new GetParameterCommand({ Name: props.PasswordParameterName, WithDecryption: true }),
  );
  const password = param.Parameter?.Value;
  if (!password) {
    throw new Error(`SSM parameter ${props.PasswordParameterName} is empty or missing`);
  }

  for (const user of users) {
    await ensureUser(props.UserPoolId, user);
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: props.UserPoolId,
        Username: user.username,
        Password: password,
        Permanent: true,
      }),
    );
    for (const group of user.groups) {
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: props.UserPoolId,
          Username: user.username,
          GroupName: group,
        }),
      );
    }
  }

  // Never echo the password back: CloudFormation stores custom resource data.
  return { PhysicalResourceId: physicalId, Data: { users: users.length } };
};

async function ensureUser(userPoolId: string, user: DemoUser): Promise<void> {
  try {
    await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: user.username }));
  } catch (err) {
    if (!(err instanceof UserNotFoundException)) throw err;
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.username,
        MessageAction: 'SUPPRESS',
        UserAttributes: [{ Name: 'name', Value: user.name }],
      }),
    );
  }
}
