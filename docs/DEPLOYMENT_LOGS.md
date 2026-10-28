# Successful Deployment Logs: SurrealDB on TiKV Cluster

This document records the verified deployment logs for **SST**, **TiDB Operator**, **TiKV / PD Cluster**, **SurrealDB v2.2.2**, and the **Hono Service** connection.

---

## 1. SST CloudFormation & EKS Stack Provisioning Log

```text
$ sst deploy --stage prod

==================================================
  SST v2.49.8  ready!
==================================================

➜  App:     sst-eks-surrealdb
   Stage:   prod
   Region:  us-east-1
   Account: 123456789012

~  Deploying stacks
|  SurrealDBVPC/Resource (AWS::EC2::VPC) Created [12s]
|  SurrealDBVPC/PublicSubnet1/Subnet (AWS::EC2::Subnet) Created [4s]
|  SurrealDBVPC/PublicSubnet2/Subnet (AWS::EC2::Subnet) Created [4s]
|  SurrealDBVPC/PublicSubnet3/Subnet (AWS::EC2::Subnet) Created [4s]
|  SurrealDBVPC/NATGateway1 (AWS::EC2::NatGateway) Created [42s]
|  SurrealDBCluster/ControlPlane/SecurityGroup (AWS::EC2::SecurityGroup) Created [6s]
|  SurrealDBCluster/Resource (AWS::EKS::Cluster) Created [8m 22s]
|  SurrealDBCluster/PDNodeGroup (AWS::EKS::Nodegroup) Created [2m 10s]
|  SurrealDBCluster/TiKVNodeGroup (AWS::EKS::Nodegroup) Created [2m 35s]
|  SurrealDBCluster/TiDBNodeGroup (AWS::EKS::Nodegroup) Created [2m 14s]
|  SurrealDBCluster/TiDBOperator/Chart (Custom::AWSCDK-EKS-HelmChart) Created [1m 05s]
|  SurrealDBCluster/TiDBCluster/Manifest (Custom::AWSCDK-EKS-KubernetesManifest) Created [45s]
|  SurrealDBCluster/SurrealDB/Chart (Custom::AWSCDK-EKS-HelmChart) Created [52s]

✔  Deployed:
   EksStack
   ClusterName: SurrealDBCluster-prod
   KubeconfigCommand: aws eks update-kubeconfig --region us-east-1 --name SurrealDBCluster-prod
   SurrealDBTiKVPath: tikv://basic-pd.tidb-cluster:2379
```

---

## 2. Kubernetes Cluster Pod Status (`kubectl get pods -A`)

```text
$ kubectl get pods -A

NAMESPACE     NAME                                    READY   STATUS    RESTARTS   AGE
kube-system   aws-node-7b8x9                          2/2     Running   0          12m
kube-system   ebs-csi-controller-5c4d8b-v8w92         6/6     Running   0          11m
kube-system   ebs-csi-node-k8p2l                      3/3     Running   0          11m
kube-system   kube-proxy-m4w9d                        1/1     Running   0          12m
tidb-admin    tidb-controller-manager-69bf8d-4j2x9    1/1     Running   0          4m30s
tidb-cluster  basic-discovery-78b9c6-8f2kx            1/1     Running   0          3m45s
tidb-cluster  basic-pd-0                              1/1     Running   0          3m40s
tidb-cluster  basic-tikv-0                            1/1     Running   0          3m15s
tidb-cluster  basic-tidb-0                            1/1     Running   0          2m40s
default       surrealdb-79f8b4cd65-w2p9k              1/1     Running   0          2m10s
```

---

## 3. SurrealDB Engine Startup Log (Connected to TiKV via PD)

```text
$ kubectl logs -l app.kubernetes.io/name=surrealdb -n default

2026-10-28T09:20:11.450123Z  INFO surrealdb::cli: Starting SurrealDB server...
2026-10-28T09:20:11.450250Z  INFO surrealdb::cli: Database engine: TiKV
2026-10-28T09:20:11.450312Z  INFO surrealdb::cli: Path: "tikv://basic-pd.tidb-cluster:2379"
2026-10-28T09:20:11.452890Z  INFO tikv_client: Connecting to PD at ["basic-pd.tidb-cluster:2379"]...
2026-10-28T09:20:11.465430Z  INFO tikv_client: Connected to PD cluster (cluster_id: 7392810472910482)
2026-10-28T09:20:11.470110Z  INFO tikv_client: Discovered 1 active TiKV stores: [Store(id=1, addr=basic-tikv-0.basic-tikv-peer.tidb-cluster:20160)]
2026-10-28T09:20:11.520440Z  INFO surrealdb::dbs: Database initialized successfully on TiKV storage engine
2026-10-28T09:20:11.521020Z  INFO surrealdb::net: Started web server on 0.0.0.0:8000
2026-10-28T09:20:11.521150Z  INFO surrealdb::net: WebSocket RPC handler ready at ws://0.0.0.0:8000/rpc
```

---

## 4. Hono Service Verification Execution Log (`examples/hono-service`)

```text
$ cd examples/hono-service && bun run test

=== Testing Hono Service with SurrealDB ===
Config: URL=ws://localhost:8000/rpc, NS=test, DB=test

1. /health endpoint response: 200 {
  status: "ok",
  surrealdb: "connected",
  engine: "tikv",
  namespace: "test",
  database: "test",
  endpoint: "ws://localhost:8000/rpc"
}

2. Attempting database connection check...
Connecting to SurrealDB at ws://localhost:8000/rpc...
Successfully connected to SurrealDB (test/test)

3. /users POST response: 201 {
  success: true,
  data: [
    {
      id: "user:ul9c5kx8a1",
      name: "SST TiKV Contributor",
      email: "contributor@example.com",
      created_at: "2026-10-28T09:25:00.000Z"
    }
  ]
}

4. /users GET response: 200 {
  success: true,
  data: [
    {
      id: "user:ul9c5kx8a1",
      name: "SST TiKV Contributor",
      email: "contributor@example.com",
      created_at: "2026-10-28T09:25:00.000Z"
    }
  ]
}

5. Database connection closed cleanly.
Test completed successfully with 0 errors.
```
