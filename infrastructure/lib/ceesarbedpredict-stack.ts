import { 
    Stack, StackProps, Duration, CfnOutput, RemovalPolicy, Aws,
    aws_ec2 as ec2,
    aws_rds as rds,
    aws_elasticloadbalancingv2 as elb,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_sqs as sqs,
    aws_logs as logs,
    aws_secretsmanager as secrets,
    aws_wafv2 as wafv2,
    aws_codepipeline as codepipeline,
    aws_codepipeline_actions as cpactions,
    aws_codebuild as codebuild,
    aws_cloudwatch as cw,
    aws_cloudwatch_actions as cw_actions,
    aws_sns as sns,
 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CeesarbedpredictStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // ====== Source control connection for pipelines ======
        const GITHUB_CONNECTION_ARN = process.env.GITHUB_CONNECTION_ARN ?? '';
        const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'Chijioke Ekechi';
        const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'CeesarBetPredict';
        const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? 'main';

        // ====== Networking ======
        const vpc = new ec2.Vpc(this, 'CeesarBetPredictVPC', {
            maxAzs: 2, // Default is all AZs in the region
            natGateways: 1,
        });

        // ====== SQS ======
        const ordersDlq = new sqs.Queue(this, 'CeesarBetPredicOrdersDLQ', {
            retentionPeriod: Duration.days(14),
            enforceSSL: true,
        });
        const ordersQueue = new sqs.Queue(this, 'CeesarBetPredictOrdersQueue', {
            visibilityTimeout: Duration.seconds(60),
            retentionPeriod: Duration.days(4),
            deadLetterQueue: {
                queue: ordersDlq,
                maxReceiveCount: 5,
            },
            enforceSSL: true,
        });

        // === Databases === (Aurora PG + Proxy w/ IAM auth)
        const dbSecurityGroup = new ec2.SecurityGroup(this, 'CeesarBetPredictDBSecurityGroup', {
            vpc,
        });
        const dbCluster = new rds.DatabaseCluster(this, 'CeesarBetPredictDBAuroraCluster', {
            engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
            writer: rds.ClusterInstance.serverlessV2('CeesarBetPredictDBWriter'),
            readers: [
                rds.ClusterInstance.serverlessV2('CeesarBetPredictDBReader'),
            ],
            defaultDatabaseName: 'CeesarBetPredictDB',
            credentials: rds.Credentials.fromGeneratedSecret('CeesarBetPredictDBUser'),
            vpc,
            securityGrous: [dbSecurityGroup],
            removalPolicy: RemovalPolicy.SNAPSHOT,
        });
        dbCluster.serverlessV2MinCapacity = 0.5;
        dbCluster.serverlessV2MaxCapacity = 16;

        const dbProxySecurityGroup = new ec2.SecurityGroup(this, 'CeesarBetPredictDBProxySecurityGroup', {
            vpc,
        });
        const dbProxy = new rds.DatabaseProxy(this, 'CeesarBetPredictDBProxy', {
            secrets: [dbCluster.secret!],
            vpc,
            securityGroups: [dbProxySecurityGroup],
            iamAuth: true,
            requireTLS: true,
            debugLogging: true,
            idleClientTimeout: Duration.minutes(30),
            maxConnectionsPercent: 90,
            borrowTimeout: Duration.seconds(30),
        });
        dbProxy.connections.allowDefaultPortFrom(ec2.Peer.anyIpv4(vpc.vpcCidrBlock));

        // ====== Secrets ======
        const dbSecret = dbCluster.secret!;
        const adminToken = new secrets.Secret(this, 'CeesarBetPredictAdminToken', {
            secretName: 'CeesarBetPredictAdminToken',
            generateSecretString: {
                passwordLength: 32,
            },
        });

        const betfairSecret = new secrets.Secret(this, 'CeesarBetPredictBetfairSecret', {
            secretName: 'CeesarBetPredictBetfairSecret',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    apiKey: '',
                    sessionToken: '',
                }),
                generateStringKey: 'apiKey',
                excludePunctuation: true,
            },
        });

        const matchbookSecret = new secrets.Secret(this, 'CeesarBetPredictMatchbookSecret', {
            secretName: 'CeesarBetPredictMatchbookSecret',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    apiKey: '',
                    sessionToken: '',
                }),
                generateStringKey: 'apiKey',
                excludePunctuation: true,
            },
        });

        const smarketScret = new secrets.Secret(this, 'CeesarBetPredictSmarketsSecret', {
            secretName: 'CeesarBetPredictSmarketsSecret',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    apiKey: '',
                    sessionToken: '',
                }),
                generateStringKey: 'apiKey',
                excludePunctuation: true,
            },
        });

        const betdaqSecret = new secrets.Secret(this, 'CeesarBetPredictBetdaqSecret', {
            secretName: 'CeesarBetPredictBetdaqSecret',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    apiKey: '',
                    sessionToken: '',
                }),
                generateStringKey: 'apiKey',
                excludePunctuation: true,
            },
        });
    }
}