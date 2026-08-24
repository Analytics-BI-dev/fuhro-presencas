# Fuhro Presenças

Sistema web para gestão de presença de corretores em reuniões de imobiliárias.

Este repositório contém apenas a estrutura técnica inicial. Funcionalidades de negócio, autenticação e integração efetiva com o banco de dados ainda não foram implementadas.

## Stack

- Next.js 16 com App Router
- React 19
- TypeScript
- Tailwind CSS 4
- ESLint
- Supabase (`@supabase/supabase-js` e `@supabase/ssr`)
- npm
- Vercel para deploy futuro

## Instalação

Requer Node.js 20.9 ou superior.

```bash
npm install
```

## Variáveis de ambiente

Copie o arquivo de exemplo para um arquivo local:

```powershell
Copy-Item .env.example .env.local
```

Em sistemas Unix, use `cp .env.example .env.local`.

As seguintes variáveis serão necessárias para a futura integração com o Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave publicável do projeto Supabase.
- `SUPABASE_SECRET_KEY`: chave secreta para uso exclusivo no servidor.

Não adicione credenciais reais ao `.env.example` nem versione arquivos locais de ambiente.

## Execução local

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Validação

```bash
npm run lint
npm run build
```
