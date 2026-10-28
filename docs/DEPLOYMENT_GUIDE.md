# Complete Deployment Guide: SurrealDB on TiKV via SST / Pulumi

This guide walks you through deploying a production-ready **SurrealDB** cluster backed by a distributed **TiKV** key-value storage engine on **Amazon EKS** using either **SST** (AWS CDK) or **Pulumi**.

---

## 📋 Prerequisites

Before starting, ensure you have the following installed and configured:

1. **AWS CLI** (`v2.x`):
   ```bash
   aws configure
   # Verify credentials and active identity
   aws sts get-caller-identity
   ```
2. **Node.js** (`>= 20.x`) and **pnpm** or **bun**:
   ```bash
   node -v
   pnpm -v # or bun -v
   ```
3. **kubectl** (`>= 1.28`):
   ```bash
   kubectl version --client
   ```
4. **Helm** (`v3.x`):
   ```bash
   helm version
   ```

---

## 🔑 Required Environment Variables

Create a `.env` file in the project root:

```bash
# AWS Region
AWS_REGION=us-east-1

# SurrealDB Configuration
SURREALDB_URL=ws://localhost:8000/rpc
SURREALDB_USER=root
SURREALDB_PASS=root
SURREALDB_NS=test
SURREALDB_DB=test

# Optional EKS Cluster Configuration
EKS_CLUSTER_NAME=SurrealDBCluster
```

---

## 🚀 Deployment Process

### Option A: Deploy via SST (Recommended)

1. **Install Dependencies**:
   ```bash
   pnpm install --ignore-scripts
   # or
   bun install --ignore-scripts
   ```

2. **Verify Type-Checking**:
   ```bash
   npm run build
   # runs: tsc --noEmit (passes with 0 errors)
   ```

3. **Deploy the SST Stack**:
   ```bash
   npx sst deploy --stage prod
   ```
   SST will:
   - Provision the 3-AZ VPC with NAT Gateway.
   - Launch the Amazon EKS cluster with dedicated node groups (`pd`, `tikv`, `tidb`).
   - Install the `aws-ebs-csi-driver` for persistent volume storage (`gp3`).
   - Install the `tidb-operator` Helm chart and register CRDs.
   - Deploy the `TidbCluster` resource (`basic-pd`, `basic-tikv`, `basic-tidb`).
   - Deploy `SurrealDB` v2.2.2 configured with `path: "tikv://basic-pd.tidb-cluster:2379"`.
   - Export CloudFormation outputs with the cluster name and connection path.

4. **Update Local Kubeconfig**:
   ```bash
   aws eks update-kubeconfig --region us-east-1 --name SurrealDBCluster
   ```

---

### Option B: Deploy via Pulumi (`surrealdb.ts`)

If deploying via Pulumi directly:

1. **Configure Pulumi Stack**:
   ```bash
   pulumi stack init prod
   pulumi config set aws:region us-east-1
   ```

2. **Run Pulumi Preview & Up**:
   ```bash
   pulumi preview
   pulumi up --yes
   ```
   Pulumi executes `setupSurrealdb(vpc)` in `surrealdb.ts`:
   - Builds managed node groups for PD, TiKV, and TiDB.
   - Applies TiDB Operator CRDs and Helm releases.
   - Provisions Kong Ingress and SurrealDB connected to the TiKV cluster.

---

## 🧪 Verification & Testing Instructions

### 1. Check Kubernetes Pod Status

Verify that all TiDB and SurrealDB pods are running healthy:

```bash
# Verify TiDB Operator
kubectl get pods -n tidb-admin

# Verify TiKV and PD Nodes
kubectl get pods -n tidb-cluster -o wide

# Expected output:
# NAME                   READY   STATUS    RESTARTS   AGE
# basic-pd-0             1/1     Running   0          4m
# basic-tikv-0           1/1     Running   0          3m
# basic-tidb-0           1/1     Running   0          2m

# Verify SurrealDB Pod
kubectl get pods -l app.kubernetes.io/name=surrealdb

# Expected output:
# NAME                         READY   STATUS    RESTARTS   AGE
# surrealdb-78f9c5bc9d-8x4pk   1/1     Running   0          2m
```

### 2. Forward SurrealDB Port Locally

```bash
kubectl port-forward svc/surrealdb 8000:8000
```

### 3. Verify SurrealDB Health via HTTP

```bash
curl -i http://localhost:8000/health
# HTTP/1.1 200 OK
```

### 4. Run the Hono Service Example

Navigate to `examples/hono-service`:

```bash
cd examples/hono-service
bun run test
# or
npm test
```

The test script:
1. Pings the `/health` endpoint and verifies engine connection (`engine: "tikv"`).
2. Performs a `POST /users` request creating a record in SurrealDB.
3. Performs a `GET /users` request fetching records from the TiKV storage engine.
4. Closes the database connection cleanly.

---

## 🛠️ Troubleshooting Guide

### 1. TiKV PVC Pending (`VolumeBindingFailed`)
- **Cause**: EBS CSI Driver is missing IAM permissions or StorageClass `gp3` is missing.
- **Fix**:
  ```bash
  kubectl describe pvc -n tidb-cluster
  # Verify EBS CSI Driver addon:
  aws eks describe-addon --cluster-name SurrealDBCluster --addon-name aws-ebs-csi-driver
  ```

### 2. PD Quorum Not Ready
- **Cause**: Placement Driver requires quorum before TiKV can register.
- **Fix**: Check PD pod logs:
  ```bash
  kubectl logs basic-pd-0 -n tidb-cluster
  ```

### 3. SurrealDB Engine Connection Timeout
- **Cause**: SurrealDB pod cannot resolve `basic-pd.tidb-cluster.svc.cluster.local:2379`.
- **Fix**: Ensure SurrealDB's connection argument uses the exact service DNS:
  `tikv://basic-pd.tidb-cluster:2379`
