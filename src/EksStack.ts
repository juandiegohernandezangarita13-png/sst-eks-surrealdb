import { StackContext } from "sst/constructs";
import * as eks from "aws-cdk-lib/aws-eks";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from "aws-cdk-lib";

export function EksStack({ stack }: StackContext) {
  // 1. Create VPC with public and private subnets across 3 Availability Zones
  const vpc = new ec2.Vpc(stack as any, "SurrealDBVPC", {
    maxAzs: 3,
    natGateways: 1,
    subnetConfiguration: [
      {
        cidrMask: 24,
        name: "ingress",
        subnetType: ec2.SubnetType.PUBLIC,
      },
      {
        cidrMask: 24,
        name: "application",
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    ],
  });

  // 2. Create EKS Cluster with gp3 storage and managed master credentials
  const cluster = new eks.Cluster(stack as any, "SurrealDBCluster", {
    vpc,
    version: eks.KubernetesVersion.V1_28,
    kubectlLayer: undefined as any,
    defaultCapacity: 2,
    defaultCapacityInstance: ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.MEDIUM
    ),
  });

  // 3. Add Dedicated PD Node Group (Placement Driver quorum)
  const pdNodeGroup = cluster.addNodegroupCapacity("PDNodeGroup", {
    instanceTypes: [
      ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
    ],
    minSize: 1,
    maxSize: 3,
    desiredSize: 1,
    labels: {
      dedicated: "pd",
    },
    taints: [
      {
        key: "dedicated",
        value: "pd",
        effect: eks.TaintEffect.NO_SCHEDULE,
      },
    ],
  });

  // 4. Add Dedicated TiKV Node Group (High-throughput Key-Value storage)
  const tikvNodeGroup = cluster.addNodegroupCapacity("TiKVNodeGroup", {
    instanceTypes: [
      ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
    ],
    minSize: 1,
    maxSize: 3,
    desiredSize: 1,
    labels: {
      dedicated: "tikv",
    },
    taints: [
      {
        key: "dedicated",
        value: "tikv",
        effect: eks.TaintEffect.NO_SCHEDULE,
      },
    ],
  });

  // 5. Add Dedicated TiDB Node Group (SQL stateless query layer)
  const tidbNodeGroup = cluster.addNodegroupCapacity("TiDBNodeGroup", {
    instanceTypes: [
      ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
    ],
    minSize: 1,
    maxSize: 2,
    desiredSize: 1,
    labels: {
      dedicated: "tidb",
    },
    taints: [
      {
        key: "dedicated",
        value: "tidb",
        effect: eks.TaintEffect.NO_SCHEDULE,
      },
    ],
  });

  // 6. Deploy TiDB Operator Helm Chart
  const tidbOperatorChart = cluster.addHelmChart("TiDBOperator", {
    chart: "tidb-operator",
    repository: "https://charts.pingcap.org",
    version: "v1.6.1",
    namespace: "tidb-admin",
    createNamespace: true,
    values: {
      operatorImage: "pingcap/tidb-operator:v1.6.1",
    },
  });
  tidbOperatorChart.node.addDependency(pdNodeGroup, tikvNodeGroup, tidbNodeGroup);

  // 7. Deploy TiDB Cluster Custom Resource (basic) for SurrealDB TiKV engine
  const tidbClusterManifest = cluster.addManifest("TiDBCluster", {
    apiVersion: "pingcap.com/v1alpha1",
    kind: "TidbCluster",
    metadata: {
      name: "basic",
      namespace: "tidb-cluster",
    },
    spec: {
      version: "v8.5.0",
      timezone: "UTC",
      pd: {
        baseImage: "pingcap/pd",
        replicas: 1,
        requests: {
          storage: "1Gi",
        },
        nodeSelector: {
          dedicated: "pd",
        },
        tolerations: [
          {
            key: "dedicated",
            value: "pd",
            effect: "NoSchedule",
          },
        ],
      },
      tikv: {
        baseImage: "pingcap/tikv",
        replicas: 1,
        requests: {
          storage: "10Gi",
        },
        nodeSelector: {
          dedicated: "tikv",
        },
        tolerations: [
          {
            key: "dedicated",
            value: "tikv",
            effect: "NoSchedule",
          },
        ],
      },
      tidb: {
        baseImage: "pingcap/tidb",
        replicas: 1,
        service: {
          type: "ClusterIP",
        },
        nodeSelector: {
          dedicated: "tidb",
        },
        tolerations: [
          {
            key: "dedicated",
            value: "tidb",
            effect: "NoSchedule",
          },
        ],
      },
    },
  });
  tidbClusterManifest.node.addDependency(tidbOperatorChart);

  // 8. Deploy SurrealDB Helm Chart connecting directly to TiKV via PD endpoint
  const surrealdbChart = cluster.addHelmChart("SurrealDB", {
    chart: "surrealdb",
    repository: "https://surrealdb.github.io/helm-charts",
    version: "0.3.7",
    namespace: "default",
    values: {
      image: {
        repository: "surrealdb/surrealdb",
        tag: "v2.2.2",
        pullPolicy: "IfNotPresent",
      },
      service: {
        type: "LoadBalancer",
        port: 8000,
      },
      surrealdb: {
        auth: false,
        path: "tikv://basic-pd.tidb-cluster:2379",
      },
    },
  });
  surrealdbChart.node.addDependency(tidbClusterManifest);

  // 9. Stack Outputs
  new cdk.CfnOutput(stack as any, "ClusterName", {
    value: cluster.clusterName,
    description: "EKS Cluster Name",
  });

  new cdk.CfnOutput(stack as any, "KubeconfigCommand", {
    value: `aws eks update-kubeconfig --region ${stack.region} --name ${cluster.clusterName}`,
    description: "Command to configure kubectl for EKS cluster",
  });

  new cdk.CfnOutput(stack as any, "SurrealDBTiKVPath", {
    value: "tikv://basic-pd.tidb-cluster:2379",
    description: "SurrealDB TiKV Engine Path",
  });

  return {
    cluster,
    vpc,
  };
}
