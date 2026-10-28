# Architecture Overview: SurrealDB on TiKV via AWS EKS

This document details the production architecture for deploying **SurrealDB** backed by a distributed, scalable **TiKV** cluster on **Amazon EKS** using **SST** (Serverless Stack) and **Pulumi**.

```mermaid
flowchart TD
    subgraph ClientLayer["Client & Application Layer"]
        HonoApp["Hono Service / API<br/>(Node.js / Lambda / Container)"]
    end

    subgraph AWSCloud["AWS Cloud (us-east-1)"]
        subgraph VPC["Amazon VPC (3 AZs)"]
            subgraph PublicSubnets["Public Subnets (Ingress)"]
                ALB["AWS Application Load Balancer / Kong Proxy"]
                NAT["NAT Gateway"]
            end

            subgraph PrivateSubnets["Private Subnets (EKS Cluster)"]
                subgraph EKSCluster["Amazon EKS Cluster v1.28 (SurrealDBCluster)"]
                    subgraph SystemNamespace["Namespace: kube-system"]
                        EBSCSI["AWS EBS CSI Driver Addon"]
                    end

                    subgraph TiDBAdmin["Namespace: tidb-admin"]
                        TiDBOp["TiDB Operator v1.6.1<br/>(Manages TiKV / PD Lifecycle)"]
                    end

                    subgraph TiDBCluster["Namespace: tidb-cluster"]
                        PD["Placement Driver (PD) Pods<br/>(Cluster Metadata & TSO Timestamp Oracle)<br/>basic-pd-0:2379"]
                        TiKV["TiKV Storage Nodes<br/>(Distributed Raft KV Store)<br/>basic-tikv-0:20160 (10Gi gp3 EBS)"]
                        TiDB["TiDB Query Engine<br/>basic-tidb-0:4000"]
                    end

                    subgraph SurrealNamespace["Namespace: default"]
                        SurrealDB["SurrealDB Engine Pods v2.2.2<br/>Path: tikv://basic-pd.tidb-cluster:2379<br/>Port: 8000"]
                    end
                end
            end
        end
    end

    HonoApp -->|WebSocket / HTTP ws://...:8000/rpc| ALB
    ALB -->|Port 8000| SurrealDB
    SurrealDB -->|PD Coordination Discovery| PD
    SurrealDB -->|Direct KV Raft Transactions| TiKV
    TiDBOp -.->|Reconciles State & CRDs| TiDBCluster
    EBSCSI -.->|Provisions gp3 PersistentVolumes| TiKV
```

---

## Component Roles & Storage Routing

### 1. Network Topology (Amazon VPC)
- **Multi-AZ Distribution**: Spans 3 Availability Zones (`us-east-1a`, `us-east-1b`, `us-east-1c`) for fault tolerance.
- **Subnet Separation**:
  - `Public Subnet`: Hosts internet-facing Application Load Balancers and NAT Gateways.
  - `Private Subnet`: Encapsulates all EKS worker nodes, TiKV stateful pods, and SurrealDB pods with no direct public IPs.

### 2. TiDB Operator & TiKV Engine
- **TiDB Operator** (`v1.6.1`): Deployed in `tidb-admin`, manages custom resources (`TidbCluster`, `TidbMonitor`).
- **Placement Driver (PD)**: Coordinates timestamp ordering (TSO), data placement, and region balancing across TiKV nodes. Listens on `basic-pd.tidb-cluster.svc.cluster.local:2379`.
- **TiKV Nodes**: Rust-based distributed transactional key-value store using Raft consensus. Data is mounted on AWS EBS `gp3` volumes backed by the `aws-ebs-csi-driver`.

### 3. SurrealDB Storage Engine Integration
- **Engine Path**: SurrealDB connects natively to TiKV using the TiKV client driver via the PD connection string:
  ```
  tikv://basic-pd.tidb-cluster.svc.cluster.local:2379
  ```
- **Transaction Model**: SurrealDB leverages TiKV's multi-version concurrency control (MVCC) and ACID two-phase commit transactions for graph, document, and relational queries.

### 4. Hono Client Application Layer
- **Interface**: Connects to SurrealDB over WebSocket/HTTP RPC on port `8000`.
- **Authentication**: Authenticates using root or scoped credentials with namespace (`test`) and database (`test`).
