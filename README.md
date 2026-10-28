# SST/Pulumi SurrealDB on TiKV Challenge — Complete Production Solution

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![SST](https://img.shields.io/badge/SST-v2-orange.svg)](https://sst.dev/)
[![Pulumi](https://img.shields.io/badge/Pulumi-v3-purple.svg)](https://www.pulumi.com/)
[![SurrealDB](https://img.shields.io/badge/SurrealDB-v2.2.2-pink.svg)](https://surrealdb.com/)
[![TiKV](https://img.shields.io/badge/TiKV-v8.5.0-green.svg)](https://tikv.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Production-grade deployment solution for **SurrealDB** backed by a distributed **TiKV** key-value storage engine on **Amazon EKS**, deployable using either **SST (AWS CDK)** or **Pulumi**.

Includes a complete **Hono** client service demonstration and comprehensive architecture documentation.

---

## 🏗️ Project Architecture

```
.
├── package.json               # Root dependencies (SST v2, AWS CDK, Pulumi types)
├── tsconfig.json              # Root TypeScript strict configuration (0 errors)
├── sst.config.ts              # SST application entrypoint
├── surrealdb.ts               # Pulumi / SST v3 deployment implementation
├── src/
│   └── EksStack.ts            # Production SST v2 / AWS CDK EKS + TiDB + SurrealDB Stack
├── examples/
│   └── hono-service/          # Full Hono API service connecting to SurrealDB on TiKV
│       ├── index.ts           # Hono routes (/health, /users CRUD) & SurrealDB client
│       ├── test-connection.ts # End-to-end validation script
│       └── package.json
└── docs/
    ├── ARCHITECTURE.md        # Detailed infrastructure architecture & Mermaid diagrams
    ├── DEPLOYMENT_GUIDE.md    # Step-by-step deployment guide & troubleshooting
    └── DEPLOYMENT_LOGS.md     # Verified deployment execution logs
```

---

## 🎯 Features Implemented

1. **Amazon EKS Infrastructure**:
   - 3-AZ Amazon VPC with isolated public ingress subnets and private application subnets.
   - Dedicated managed node groups tailored with Kubernetes taints and labels:
     - `pd`: Placement Driver nodes (`t4g.small` / `c5.xlarge`)
     - `tikv`: Transactional distributed storage nodes (`t4g.medium` / `r5b.2xlarge`)
     - `tidb`: Stateless SQL query nodes (`t4g.medium` / `c5.2xlarge`)
   - `aws-ebs-csi-driver` integration with dynamic `gp3` storage class provisioning.

2. **TiDB Operator & Cluster Orchestration**:
   - Automated deployment of `tidb-operator` v1.6.1 Helm chart with official CRDs.
   - Deployment of `TidbCluster` custom resource provisioning PD, TiKV, and TiDB pods with multi-zone placement.

3. **SurrealDB TiKV Engine Integration**:
   - SurrealDB v2.2.2 container deployed via Helm directly attached to the distributed TiKV engine:
     ```
     path: "tikv://basic-pd.tidb-cluster:2379"
     ```
   - Automated health probes, service load balancing, and persistence.

4. **Hono Client Service**:
   - Express/Cloudflare/Lambda-ready Hono API service with graceful connection retry.
   - Verified CRUD operations on SurrealDB:
     - `GET /health`: Cluster health, engine check, and latency.
     - `POST /users`: Record insertion.
     - `GET /users`: Record query.
     - `GET /users/:id`: Key-value lookup.

---

## 🚀 Quick Start

### 1. Build and Type-Check
```bash
npm run build
# Compiles all stacks and scripts with 0 errors: tsc --noEmit
```

### 2. Deploy via SST
```bash
npx sst deploy --stage prod
```

### 3. Deploy via Pulumi (Alternative)
```bash
pulumi up
```

### 4. Run Hono Test Suite
```bash
cd examples/hono-service
npm install --ignore-scripts
npm test
```

---

## 📚 Documentation Links

- [Complete Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Infrastructure Architecture & Mermaid Diagram](docs/ARCHITECTURE.md)
- [Successful Deployment Logs](docs/DEPLOYMENT_LOGS.md)

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.
