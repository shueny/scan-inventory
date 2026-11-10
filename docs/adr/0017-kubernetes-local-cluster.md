# 0017 · Kubernetes manifests for local full mode

Status: **proposed, waiting for the owner** · 2026-11-09 · Task T11 (PRD 1.2 draft, section 6.3)

## Context

The PRD (section 4) listed Kubernetes as out of scope. The owner wants to show how the local full mode would run on Kubernetes, and to be able to explain it in interviews. PRD 1.2 (draft) adds section 6.3 and task T11. Nothing is hosted publicly, and the public demo stays on Cloudflare (ADR 0015).

Facts from the current code that shape the options:

- `api/docker-entrypoint.sh` runs `alembic upgrade head`, then `python -m app.seed`, then uvicorn, in every container start. With several API pods, every pod would migrate at the same time. ADR 0009 chose this for one-command `docker compose up` and named the race as the cost.
- The API reads `DATA_DIR` (the three JSON files) only in `app/seed.py`. Once seeded, an API pod needs no data files.
- `web/nginx.conf` uses `resolver 127.0.0.11`, Docker's built-in DNS, together with `set $api http://api:8000`. That address does not exist in a Kubernetes pod.
- The full tiles are 3.0 GB, the 13 % tiles 399 MB. Rule 6: data never goes into git, and it should not go into images either.
- The pipeline needs the 3.25 GB source file and PotreeConverter, and has no container image yet.

Each section below is a choice for the owner, with a recommendation.

## 1. Target cluster

| option | for | against |
|---|---|---|
| **A. kind (Kubernetes in Docker) on the laptop** | free; the same on the laptop and in CI; can be deleted in one command | not a real multi-machine cluster |
| B. A managed cloud cluster (GKE, EKS, AKS) | real nodes, real load balancer | costs money while it runs; the API and database would be hosted publicly, which the PRD keeps out of scope |
| C. Both, through two overlays | shows the path to production | twice the work; B's costs remain |

**Recommendation: A.** It meets the goal (show and explain the mapping) at zero cost, and the Kustomize layout (section 2) leaves room for a cloud overlay later.

## 2. Packaging

| option | for | against |
|---|---|---|
| Plain YAML files | most transparent | values repeated per environment |
| **Kustomize** (base + overlays) | plain YAML plus small patches; built into `kubectl` (`kubectl apply -k`) | no templating, no release history |
| Helm chart | industry standard; release history and rollback; hooks | Go templates are harder to read and explain; the PRD keeps Helm out of scope |

**Recommendation: Kustomize.** Every file stays readable YAML, which matters more here than Helm's release features.

## 3. Schema migration and seeding

| option | for | against |
|---|---|---|
| Keep the entrypoint, run 1 API replica | no change | hides the problem, and one replica means no rolling update without downtime |
| initContainer in each API pod | runs before the app, without an extra step | still runs once per pod, so two pods still race |
| **A Job (`migrate-seed`) before the API rolls out** | runs exactly once per deploy; its own logs; failure stops the deploy | one more step in the deploy script (`kubectl wait --for=condition=complete job/...`) |
| Helm pre-install/pre-upgrade hook | automatic ordering | only with Helm (section 2) |

**Recommendation: the Job.** The image and the entrypoint stay as they are, so compose does not change. The Kubernetes manifests set `command` explicitly: the Job runs migrate and seed, and the Deployment runs only uvicorn. Seeding is already idempotent (ADR 0009), so running the Job again is safe.

## 4. Database

| option | for | against |
|---|---|---|
| **PostgreSQL 16 as a StatefulSet with a PersistentVolumeClaim** | runs inside kind; the same image as compose | backups and upgrades are our job (fine for a local cluster) |
| A managed database (Cloud SQL, RDS) | the right answer in production | does not exist on a laptop; needs option 1B |

**Recommendation: StatefulSet in the kind overlay.** A cloud overlay would drop it and point the `DATABASE_URL` Secret at a managed database; nothing else changes.

## 5. Tiles and JSON data

| option | for | against |
|---|---|---|
| **Mount the host's `data/` into the kind node (`extraMounts`), then into pods as a read-only volume** | same idea as compose; no copy; data stays out of git and images | works only on a local cluster |
| MinIO (S3-compatible storage) in the cluster | the same shape as the R2 setup in production | one more service and an upload step |
| Bake the data into an image | simplest to run | a 3 GB image; breaks rule 6 in spirit |

**Recommendation: the read-only host mount.** The web pod mounts `data/potree` and the migrate-seed Job mounts the JSON; the API pods mount nothing. Object storage plus a CDN is the production answer and is already proven by the demo (ADR 0015).

## 6. Entry point and the nginx DNS setting

| option | for | against |
|---|---|---|
| **No Ingress: the web Service is reached on localhost:8088 (kind `extraPortMappings` to a NodePort); a ConfigMap replaces `default.conf` in the web pod** | the web nginx already routes `/`, `/api` and `/potree`, as in compose (ADR 0014); compose keeps its file | no TLS, no host-based routing |
| An Ingress controller in front | the usual production shape | one more component; the common ingress-nginx controller has been retired upstream, so a new setup would use the Gateway API, which is more to explain |
| Template `nginx.conf` with an environment variable for the resolver | one file for both | changes the compose image for a Kubernetes concern |

**Recommendation: no Ingress, plus a ConfigMap for nginx.** In Kubernetes a Service has a stable cluster IP, so the ConfigMap version uses a plain `proxy_pass http://api:8000;` without the Docker resolver. Ingress or Gateway API is a proposal for a cloud overlay.

## Proposed layout

```
infra/k8s/
  base/
    kustomization.yaml
    namespace.yaml
    postgres-statefulset.yaml   postgres-service.yaml
    migrate-seed-job.yaml
    api-deployment.yaml         api-service.yaml
    web-deployment.yaml         web-service.yaml   web-nginx-configmap.yaml
  overlays/kind/
    kustomization.yaml          (NodePort, host data mounts, image tags)
    kind-cluster.yaml           (extraMounts for data/, extraPortMappings 8088)
scripts/k8s/up.sh, down.sh      (create cluster, load images, Secret from .env, Job, deploy)
```

## Not in T11 (proposals for later)

- The pipeline as a Kubernetes Job with a 2 GiB memory limit (PRD 10). It needs a pipeline image with PotreeConverter, and the 3.25 GB source file in the cluster.
- A cloud overlay: managed database, object storage and CDN for tiles, Gateway API with TLS, HorizontalPodAutoscaler for the API.
- Network policies (only `api` may reach `db`).

## Consequences (if the recommendations are accepted)

- `docker compose up` keeps working unchanged: same images, same entrypoint, same `nginx.conf`.
- Two nginx configurations exist (compose file, Kubernetes ConfigMap). They differ only in how `/api` finds the API; a comment in each points to the other.
- `make check` and CI gain a render-and-validate step for the manifests (no cluster needed). A full run on kind stays a local check, like the browser checks on real data.
- Resource requests and limits are set from measurements taken during T11, not guessed.
- The deploy order is part of the script: database ready, then the migrate-seed Job complete, then the API and web Deployments.
