# AutoTunchi

Plataforma self-hosted para desplegar proyectos en Kubernetes. Despliega desde repositorios privados de GitHub con builds automáticos, configuración DNS y gestión de recursos.

## Features

- **GitHub Integration** - Conecta repos privados, webhooks automáticos en push
- **Smart Builds** - Detección de Dockerfile o Buildpacks para cualquier lenguaje
- **Pulumi Deployments** - Infrastructure as Code por proyecto
- **Cloudflare DNS** - Configuración DNS automática opcional
- **Node Metrics** - Monitorea CPU/RAM por nodo, selecciona node affinity
- **100% Self-hosted** - Sin dependencias de clouds externos

## Quick Start (Development)

```bash
# Clonar
git clone https://github.com/darwinva97/autotunchi.git
cd autotunchi

# Instalar dependencias
npm install

# Configurar environment
cp .env.example .env
# Editar .env con tus valores

# Iniciar PostgreSQL
docker-compose up -d postgres

# Correr migraciones
npm run db:migrate

# Iniciar servidor de desarrollo
npm run dev
```

## Deploy a K3S con ArgoCD

Este proyecto está diseñado para integrarse con un cluster GitOps existente usando ArgoCD App of Apps.

### Prerrequisitos

- K3S cluster con ArgoCD, Cert-Manager, External-DNS, Traefik
- GitHub Container Registry (o registry self-hosted)

### Paso 1: Subir a GitHub

```bash
cd autotunchi
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:darwinva97/autotunchi.git
git push -u origin main
```

### Paso 2: Construir y Pushear la Imagen

```bash
# Build
docker build -t ghcr.io/darwinva97/autotunchi:latest .

# Login a GHCR
echo $GITHUB_PAT | docker login ghcr.io -u darwinva97 --password-stdin

# Push
docker push ghcr.io/darwinva97/autotunchi:latest
```

### Paso 3: Crear GitHub OAuth App

1. Ir a GitHub → Settings → Developer settings → OAuth Apps
2. New OAuth App:
   - **Application name**: AutoTunchi
   - **Homepage URL**: `https://autotunchi.smartperu.tech`
   - **Callback URL**: `https://autotunchi.smartperu.tech/api/auth/callback/github`
3. Guardar Client ID y Client Secret

### Paso 4: Configurar Secrets

Editar `apps/autotunchi/secrets.yaml`:

```bash
# Generar secrets seguros
openssl rand -base64 32  # Para AUTH_SECRET
openssl rand -base64 32  # Para ENCRYPTION_KEY
```

```yaml
AUTH_SECRET: "tu-secret-generado"
ENCRYPTION_KEY: "otro-secret-generado"
AUTH_GITHUB_ID: "tu-client-id-del-paso-3"
AUTH_GITHUB_SECRET: "tu-client-secret-del-paso-3"
```

### Paso 5: Agregar a tu Root App

Copiar el contenido de `apps/autotunchi/ADD_TO_ROOT_APP.yaml` a tu `kubernetes-cluster/clusters/k3s/root-app.yaml` en la sección de aplicaciones.

### Paso 6: Crear ImagePullSecret

```bash
kubectl create namespace autotunchi

kubectl create secret docker-registry ghcr-secret \
  --namespace autotunchi \
  --docker-server=ghcr.io \
  --docker-username=darwinva97 \
  --docker-password=<TU_GITHUB_PAT>
```

### Paso 7: Push y Sync

```bash
# En tu repo de autotunchi
git add .
git commit -m "Configure secrets"
git push

# En tu repo kubernetes-cluster
git add .
git commit -m "Add autotunchi application"
git push

# ArgoCD sincronizará automáticamente
```

## Qué hace tu cluster automáticamente

Gracias a tu setup GitOps existente:

| Componente | Acción Automática |
|------------|-------------------|
| **External-DNS** | Crea registro `autotunchi.smartperu.tech` en Cloudflare |
| **Cert-Manager** | Genera certificado TLS con Let's Encrypt |
| **Traefik** | Configura routing HTTPS |
| **ArgoCD** | Sincroniza cambios de Git automáticamente |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tu K3S Cluster                            │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ AutoTunchi  │  │  External   │  │ Cert-Manager│          │
│  │  (Next.js)  │  │    DNS      │  │             │          │
│  └──────┬──────┘  └─────────────┘  └─────────────┘          │
│         │                                                    │
│         │ Crea deployments via Pulumi                        │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────┐       │
│  │              User Deployments                     │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐           │       │
│  │  │ App 1   │  │ App 2   │  │ App N   │           │       │
│  │  └─────────┘  └─────────┘  └─────────┘           │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Estructura del Proyecto

```
autotunchi/
├── src/
│   ├── app/                 # Next.js pages
│   ├── components/          # React components
│   ├── lib/
│   │   ├── pulumi/          # Pulumi automation
│   │   ├── kubernetes/      # K8s client & metrics
│   │   ├── cloudflare/      # DNS management
│   │   ├── github/          # GitHub API & webhooks
│   │   └── builder/         # Docker/Buildpacks
│   └── server/routers/      # tRPC API
├── prisma/                  # Database schema
├── apps/
│   └── autotunchi/          # K8s manifests (Kustomize)
│       ├── kustomization.yaml
│       ├── namespace.yaml
│       ├── secrets.yaml     # ⚠️ Editar con tus valores
│       ├── configmap.yaml
│       ├── serviceaccount.yaml
│       ├── postgres.yaml    # PostgreSQL privado
│       ├── pvc.yaml
│       ├── deployment.yaml
│       ├── ingress.yaml
│       └── ADD_TO_ROOT_APP.yaml  # Snippet para root-app
├── Dockerfile
└── docker-compose.yml       # Desarrollo local
```

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS, shadcn/ui
- **Backend**: tRPC, Prisma, NextAuth.js
- **Infrastructure**: Pulumi TypeScript, Kubernetes client
- **Build**: Paketo Buildpacks, Docker
- **GitOps**: ArgoCD, Kustomize

## Troubleshooting

### La imagen no se puede pullear

Verificar que el secret `ghcr-secret` existe en el namespace:
```bash
kubectl get secret ghcr-secret -n autotunchi
```

### El pod no inicia (CrashLoopBackOff)

Ver logs:
```bash
kubectl logs -n autotunchi deployment/autotunchi
```

Errores comunes:
- `DATABASE_URL` incorrecto → Verificar que PostgreSQL está corriendo
- `AUTH_SECRET` muy corto → Debe ser al menos 32 caracteres

### DNS no se crea

Verificar que External-DNS tiene acceso:
```bash
kubectl logs -n external-dns deployment/external-dns
```

## License

MIT
