import {App, AutoBranchCreation} from '@aws-cdk/aws-amplify-alpha';
import {CfnOutput, SecretValue, Stack, StackProps} from 'aws-cdk-lib';
import {BuildSpec} from 'aws-cdk-lib/aws-codebuild';
import {Construct} from 'constructs';
import {ManagedPolicy, Role, ServicePrincipal} from 'aws-cdk-lib/aws-iam';
import {GitHubSourceCodeProvider} from '@aws-cdk/aws-amplify-alpha/lib/source-code-providers';

import {environmentVariables} from './environmentVariables';
import {CfnApp, CfnBranch} from "aws-cdk-lib/aws-amplify";
import {configuration} from "./config";

export const autoBranchCreation: AutoBranchCreation = {
  autoBuild: true,
  patterns: ['feature/*'],
  pullRequestPreview: true,
};

export const buildSpec = BuildSpec.fromObjectToYaml({
  version: '1.0',
  applications: [
    {
      appRoot: "source",
      frontend: {
        phases: {
          preBuild: {
            commands: [
              // Install the correct Node version, defined in .nvmrc
              'nvm use',
              // Install pnpm
              'corepack enable',
              'corepack prepare pnpm@latest --activate',
              // Avoid memory issues with node
              'export NODE_OPTIONS=--max-old-space-size=8192',
              'pnpm install --virtual-store-dir ./node_modules/.pnpm',
              // Ensure node_modules are correctly included in the build artifacts
              'pnpm install',
            ],
          },
          build: {
            commands: [
              // Allow Next.js to access environment variables
              // See https://docs.aws.amazon.com/amplify/latest/userguide/ssr-environment-variables.html
              `env | grep -E '${Object.keys(environmentVariables).join('|')}' >> .env.production`,
              // Build Next.js app
              'pnpm next build --no-lint',
            ],
          },
        },
        artifacts: {
          baseDirectory: '.next',
          files: ['**/*'],
        },
      },
    },
  ],
});
export class AmplifyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const role = new Role(this, 'AmplifyRoleWebApp', {
      assumedBy: new ServicePrincipal('amplify.amazonaws.com'),
      description: 'Custom role permitting resources creation from Amplify',
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify')],
    });

    const sourceCodeProvider = new GitHubSourceCodeProvider({
      // GitHub token should be saved in a secure place, we recommend AWS Secret Manager:
      oauthToken: SecretValue.secretsManager(configuration.accessTokenName), // replace GITHUB_TOKEN_KEY by the name of the Secrets Manager resource storing your GitHub token
      owner: configuration.repoOwner,
      repository: configuration.repoName
    });



    const autoBranchDeletion = true;

    // Define Amplify app
    const amplifyApp = new App(this, 'AmplifyAppResource', {
      appName: configuration.repoName,
      description: 'NextJS APP deployed with Dev-kit',
      // ⬇️ configuration items to be defined ⬇️
      role,
      sourceCodeProvider,
      buildSpec,
      autoBranchCreation,
      autoBranchDeletion,
      environmentVariables,
      // ⬆️ end of configuration ⬆️
    });

    const cfnApp = amplifyApp.node.defaultChild as CfnApp;
    cfnApp.platform = 'WEB_COMPUTE';

    // Attach your main branch and define the branch settings (see below)
    const mainBranch = amplifyApp.addBranch('main', {
      autoBuild: false, // set to true to automatically build the app on new pushes
      stage: 'PRODUCTION',
    });

    const cfnBranch = mainBranch.node.defaultChild as CfnBranch;
    cfnBranch.framework = 'Next.js - SSR';

    new CfnOutput(this, `${configuration.repoName}-appId`, {
      value: amplifyApp.appId,
    });

    // const domain = amplifyApp.addDomain('your-domain.com', {
    //   autoSubdomainCreationPatterns: ['feature/*'],
    //   enableAutoSubdomain: true,
    // });
    //
    // domain.mapRoot(mainBranch);
  }
}