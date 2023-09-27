import * as cdk from 'aws-cdk-lib';

import { AmplifyStack } from './stack';
import {configuration} from "./config";

const app = new cdk.App();

new AmplifyStack(app, `NextjsStack-${configuration.repoName}`, {
  description: 'Cloudformation stack containing the Amplify configuration',
});