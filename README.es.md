<div align="center">

<img src="assets/orcarouter-logo.png" alt="OrcaRouter" width="96" height="96">

# OrcaRouter Tools

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español**

**Una sola API key. Más de 1.400 herramientas de datos que tu agente de IA puede descubrir, comparar y ejecutar, pagando por llamada.**

Búsqueda web, redes sociales, datos de empresas y personas, búsqueda de emails, SEO, mercados financieros y más, de 15 proveedores.
Tu agente elige la herramienta, la ejecuta y solo pagas lo que usa.

[![npm: tools-skill](https://img.shields.io/npm/v/@orcarouter/tools-skill?label=%40orcarouter%2Ftools-skill&color=2563eb)](https://www.npmjs.com/package/@orcarouter/tools-skill)
[![npm: cli](https://img.shields.io/npm/v/@orcarouter/cli?label=%40orcarouter%2Fcli&color=2563eb)](https://www.npmjs.com/package/@orcarouter/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

[Sitio web](https://www.orcarouter.ai) · [Documentación](https://docs.orcarouter.ai/agent-infra/tools/overview) · [Obtén una API key](https://www.orcarouter.ai/register?redirect=/console/token)

Funciona con **Claude Code** · **Codex** · **Cursor** · **OpenClaw** · **Hermes** · **opencode**, y con cualquier agente que pueda leer un archivo de skill.

</div>

---

## Míralo en acción

<a href="assets/people-search.mp4"><img src="assets/people-search-preview.gif" alt="Un agente prueba un buscador de emails, no obtiene resultado, cambia al siguiente proveedor y consigue un email verificado" width="100%"></a>

<p align="center"><a href="assets/people-search.mp4"><b>▶ Ver la demo de 60 segundos</b></a> (MP4, con sonido)</p>

> Se le pide a un agente el responsable de plataforma de 20 startups de infraestructura de IA, cada uno con un email
> de trabajo verificado, por menos de 3 $. Encuentra las empresas, compara 13 buscadores de emails de 6 proveedores,
> pasa al siguiente proveedor cuando uno no encuentra nada y pide una vez permiso al propietario antes de una llamada
> que supera su límite.
> Resultado: 20 emails verificados por **1,06 $**, sin suscripción.
>
> <sub>Los nombres y precios de las herramientas son precios de lista reales de OrcaRouter. Las empresas, personas y resultados son ilustrativos.</sub>

## Por qué OrcaRouter Tools

- 🔑 **Una clave, un monedero.** Una sola API key de OrcaRouter cubre todas las herramientas. El mismo monedero paga también tus llamadas a modelos.
- 🔎 **Busca por tarea, no por proveedor.** Pide "company enrichment" o "tiktok posts" y obtén las herramientas que encajan, ordenadas, con precio, tasa de éxito a 7 días y latencia.
- 🔁 **Alternativas cuando una herramienta falla.** Las herramientas que hacen la misma tarea comparten un `route_group`. Si una falla o no encuentra nada, tu agente lista las demás y prueba la siguiente por su cuenta.
- 💵 **Pago por llamada.** Sin suscripción ni contrato. Cada ejecución se cotiza antes de hacerse, y una llamada que falla no se cobra.
- 🛡️ **Tus reglas en cada llamada.** Define un presupuesto por agente, un límite por llamada y umbrales de aprobación. Por encima del límite, el agente pide permiso a una persona primero.

## Inicio rápido

### 1. Consigue una API key

[Regístrate](https://www.orcarouter.ai/register?redirect=/console/token) o
[inicia sesión](https://www.orcarouter.ai/login?redirect=/console/token). Ambos te llevan a la página de API keys, y una cuenta nueva ya tiene una. Después:

```bash
export ORCA_KEY=<tu API key de OrcaRouter>
```

Nunca pegues la clave en un prompt. Si te saltas este paso, el agente te guiará la primera vez que necesite una herramienta.

### 2. Dale la skill a tu agente

Dile a tu agente:

```
set up https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md
```

O instálala como skill de Claude Code:

```bash
mkdir -p ~/.claude/skills/orcarouter-tools
curl -fsSL https://cdn.jsdelivr.net/npm/@orcarouter/tools-skill/SKILL.md \
  -o ~/.claude/skills/orcarouter-tools/SKILL.md
```

Luego pide lo que necesites, por ejemplo *"busca la página de LinkedIn, el número de empleados y el año de fundación de vercel.com, gasta como máximo 0,10 $"*.

### 3. O usa la CLI

```bash
npm install -g @orcarouter/cli
orca-tools setup -k <YOUR_API_KEY>
orca-tools discover -q "company enrichment"
orca-tools run -t <toolId> -i '{"company_domain":"vercel.com"}'
```

## Cómo funciona

Tu agente sigue tres pasos, todos descritos en [`SKILL.md`](SKILL.md):

1. **discover**: busca en el catálogo lo que necesitas. Cada resultado trae su precio, su estado y, cuando tiene sustitutos, su `route_group`.
2. **inspect**: lee el esquema de entrada de una herramienta antes de ejecutarla.
3. **run**: la llamada se cotiza, se ejecuta y se cobra al monedero de tu workspace. La respuesta incluye el resultado y lo que costó.

Una misma tarea suele tener varios proveedores, así que tu agente puede compararlos antes de gastar nada:

<img src="assets/compare-sources.png" alt="Cuatro herramientas de empresas de LinkedIn de distintos proveedores, cada una con precio, tasa de éxito a 7 días y latencia" width="100%">

## Qué hay en el catálogo

Redes sociales (TikTok, Instagram, YouTube, LinkedIn, X, Reddit, Facebook y más), buscadores y SEO,
visibilidad en búsquedas con IA, empresas y personas, búsqueda de emails y teléfonos, web scraping, mercados financieros y más.

<img src="assets/catalog-companies-people.png" alt="Empresas y personas: búsqueda de empresas, búsqueda de personas, búsqueda y verificación de emails, búsqueda de teléfonos" width="100%">

El catálogo en vivo, con el precio y el estado de cada herramienta, está en la [consola de OrcaRouter](https://www.orcarouter.ai/console).

## La CLI

`orca-tools` es la misma API desde una terminal, pensada para agentes. Imprime texto plano sin códigos de color, no tiene dependencias y necesita Node 18 o superior.

<img src="assets/cli.png" alt="orca-tools discover, luego run y después jq sobre la salida guardada" width="100%">

```
orca-tools discover -q <query> [-l <limit>] [-c <category>]
orca-tools discover -g <routeGroup>          # alternativas de una herramienta
orca-tools inspect  -t <toolId>
orca-tools run      -t <toolId> -i '<json>' [-o out.json]
orca-tools runs list | runs get -r <runId>
orca-tools balance
```

Referencia completa: [`cli/README.md`](cli/README.md) (en inglés).

## Control del gasto

Cada agente tiene su propio presupuesto, límite por llamada y regla de aprobación, y cada ejecución queda registrada con su entrada, salida, precio y latencia.

<img src="assets/budget-controls.png" alt="Presupuesto mensual de un agente con corte al alcanzarlo, y su extracto de cargos" width="100%">

Una llamada que falla no cuesta nada. Aparece en el registro de ejecuciones, anulada a 0,00 $:

<img src="assets/failed-calls-free.png" alt="Registro de ejecuciones en el que una llamada fallida a un proveedor se anula y se cobra 0,00 $" width="100%">

## En este repositorio

- **[`SKILL.md`](SKILL.md)**: la skill del agente. Cómo descubrir, inspeccionar y ejecutar herramientas, leer errores y controlar el gasto.
  Publicada como [`@orcarouter/tools-skill`](https://www.npmjs.com/package/@orcarouter/tools-skill).
- **[`cli/`](cli/)**: `orca-tools`, el cliente de línea de comandos.
  Publicado como [`@orcarouter/cli`](https://www.npmjs.com/package/@orcarouter/cli).
- **[`assets/`](assets/)**: las imágenes y el vídeo de demostración que usa este README.

## Enlaces

- Documentación: [docs.orcarouter.ai/agent-infra/tools](https://docs.orcarouter.ai/agent-infra/tools/overview)
- Sitio web: [orcarouter.ai](https://www.orcarouter.ai)

## Licencia

[MIT](LICENSE)

---

<sub>Este documento es una traducción de [README.md](README.md); la versión en inglés es la de referencia.</sub>
