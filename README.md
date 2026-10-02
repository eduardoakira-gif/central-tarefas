# Central de Tarefas

Painel pessoal para organizar e acompanhar demandas profissionais nas cinco áreas fixas: **Sócio Torcedor, Comunidade, Merchan, CRM e Propostas**.

Ao abrir o site você vê o que fazer hoje, o que está atrasado, o que é urgente, o que está em andamento, o que está aguardando retorno de terceiros e o que já foi concluído. Os lembretes avisam periodicamente sobre o que ainda depende de você.

O projeto é 100% estático (HTML, CSS e JavaScript, sem build) e roda gratuitamente no GitHub Pages. Funciona como PWA: pode ser instalado na tela inicial do celular ou como app no computador, e abre offline.

---

## Funcionalidades

- **Dashboard**: resumo do dia, indicadores (pendentes, em andamento, aguardando retorno, atrasadas, concluídas), produtividade do dia com barra de progresso e contador de tarefas abertas por área.
- **Organização automática** em Atrasadas, Hoje, Próximas, Aguardando retorno, Sem prazo e Concluídas recentemente.
- **Ordenação**: atrasadas, urgentes, prazo hoje, alta prioridade, horário mais próximo, normal, baixa.
- **Aguardando retorno**: registra de quem você está aguardando, desde quando e quando cobrar. Essas tarefas ficam fora da lista principal e dos lembretes até a data de cobrança; nesse dia voltam ao topo com destaque "Cobrar retorno hoje".
- **Filtros combináveis**: situação (Todas, Hoje, Atrasadas, Pendentes, Em andamento, Aguardando retorno, Urgentes, Concluídas) + área + busca por texto (título, descrição, área, responsável, pessoa/empresa, observações e link).
- **Cadastro rápido**: título, área, prazo, prioridade e status visíveis; o resto em "Mais detalhes". Atalhos de data (Hoje, Amanhã, Em 1 semana).
- **Edição rápida no card**: status, prioridade e prazo sem abrir o formulário.
- **Histórico**: concluídas ficam guardadas com data de conclusão; é possível restaurar ou excluir definitivamente.
- **Desfazer** ao concluir ou excluir.
- **Modo claro, escuro ou automático**, salvo nas preferências.
- **Backup** em JSON (exportar e importar).
- **Atalhos de teclado**: `N` nova tarefa, `/` busca, `Ctrl/Cmd + Enter` salva o formulário, `Esc` fecha.
- **Mobile**: layout próprio, botão flutuante `+` e instalação na tela inicial.

---

## Estrutura dos arquivos

```
/
├── index.html                 Estrutura das telas e diálogos
├── manifest.json              Configuração do PWA (nome, ícones, cores, atalho "Nova tarefa")
├── service-worker.js          Cache offline, lembretes em segundo plano e recepção de push
├── .nojekyll                  Faz o GitHub Pages servir os arquivos sem processar com Jekyll
├── css/
│   └── styles.css             Visual (tema claro/escuro, responsivo)
├── js/
│   ├── core.js                Regras compartilhadas com o service worker: áreas, datas,
│   │                          classificação, ordenação, texto da notificação, IndexedDB
│   ├── storage.js             Persistência (IndexedDB) e backup. Ponto de troca para sync futuro
│   ├── tasks.js               Operações com tarefas, filtros e indicadores
│   ├── notifications.js       Permissão, lembretes locais, periodic sync e push via servidor
│   ├── ui.js                  Geração do HTML (dashboard, cards, seções, histórico)
│   └── app.js                 Inicialização, rotas, eventos, formulários, configurações
├── assets/                    Ícones do app
├── backend/supabase/          Opcional: push real com o app fechado
│   ├── schema.sql             Tabela do Supabase
│   ├── cron.sql               Agendador (pg_cron)
│   └── functions/lembretes/index.ts   Edge Function que envia os pushes
└── .github/workflows/
    └── lembretes.yml          Agendador alternativo via GitHub Actions (desligado por padrão)
```

---

## Como executar localmente

O service worker exige que o site seja servido por HTTP (abrir o `index.html` direto pelo arquivo não funciona). Na pasta do projeto, rode um destes:

```bash
python3 -m http.server 8080
# ou
npx serve .
```

Abra `http://localhost:8080`. O `localhost` é tratado como seguro, então PWA e notificações funcionam.

---

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub (por exemplo, `central-tarefas`). No plano gratuito, o GitHub Pages exige repositório **público**. Os dados das tarefas **não** ficam no repositório, ficam no seu navegador.
2. Envie todos os arquivos desta pasta para a branch `main`, mantendo a estrutura (inclusive `.nojekyll` e `.github/`).
   - Pelo site: **Add file → Upload files**, arraste o conteúdo da pasta e faça o commit.
   - Pelo terminal:
     ```bash
     git init
     git add .
     git commit -m "Central de tarefas"
     git branch -M main
     git remote add origin https://github.com/SEU-USUARIO/central-tarefas.git
     git push -u origin main
     ```
3. No repositório, vá em **Settings → Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. Em 1 a 2 minutos o site estará em `https://SEU-USUARIO.github.io/central-tarefas/`.

## Como atualizar o projeto

1. Edite os arquivos e faça commit/push para a `main`. O GitHub Pages republica sozinho.
2. Sempre que mudar arquivos do app, aumente `CACHE_VERSION` no topo do `service-worker.js` (por exemplo, `v1.0.0` → `v1.0.1`). Isso garante que celulares e computadores com o app instalado baixem a nova versão.
3. Se algo parecer desatualizado, feche todas as abas do app e abra de novo.

Suas tarefas não são afetadas por atualizações do código.

---

## Como funciona o armazenamento

- As tarefas e configurações ficam no **IndexedDB** do navegador, no dispositivo onde foram criadas. Atualizar a página, fechar o navegador ou reiniciar o computador não apaga nada.
- Os dados **não** são compartilhados entre computador e celular nesta versão. Para levar de um para outro, use **Configurações → Exportar backup** e **Importar backup**.
- Limpar os dados do site no navegador apaga as tarefas. Exporte um backup de vez em quando.
- A camada de dados está isolada em `js/storage.js`. Para sincronizar dispositivos no futuro, crie um adaptador com os mesmos métodos (`loadTasks`, `saveTask`, `deleteTask`, `replaceTasks`, `loadSettings`, `saveSettings`) usando Supabase ou Firebase e troque a linha `const adapter = IndexedDBAdapter;`. O restante do app não precisa mudar.

**Formato do backup**: JSON com `tasks`, `areas`, `statuses`, `priorities` e `settings` (frequência, horários, tema, última área usada, URL e chave pública do push). O token de push nunca é exportado.

---

## Como funciona a PWA

- `manifest.json` define nome, ícones, cores e um atalho "Nova tarefa" (pressione e segure o ícone no Android).
- `service-worker.js` guarda os arquivos em cache para abrir rápido e offline, mostra as notificações e recebe os pushes.

**Instalar**
- **Android (Chrome)**: menu ⋮ → *Instalar app* (ou *Adicionar à tela inicial*).
- **iPhone (Safari)**: botão Compartilhar → *Adicionar à Tela de Início*. Abra sempre pelo ícone; é assim que o iOS libera notificações (iOS 16.4 ou superior).
- **Computador (Chrome/Edge)**: ícone de instalar na barra de endereço, ou em **Configurações → Instalar app** dentro do próprio site.

---

## Como habilitar notificações

1. Abra **Configurações**.
2. Clique em **Permitir notificações** e aceite o pedido do navegador.
3. Ajuste frequência (padrão 2 horas) e janela de horário (padrão 08:00 às 20:00).
4. Clique em **Enviar notificação de teste** para conferir.

**O que a notificação mostra**: total de demandas que dependem de você, quantas são atrasadas, urgentes, para hoje e próximas, retornos a cobrar e as três principais, na ordem de prioridade. Exemplo:

```
Tarefas pendentes, 1 atrasada
Você ainda possui 7 demandas abertas.
1 atrasada, 2 urgentes, 3 para hoje e 1 próxima.
1 retorno para cobrar.

Principais:
• Responder lead no CRM
• Aprovar proposta patrocinador
• Cobrar retorno: Relatório ST para board
```

Tarefas em "Aguardando retorno" só entram no dia da cobrança. Se nada depender de você, nenhuma notificação é enviada. Fora da janela de horário, nada é enviado.

---

## Limitações do GitHub Pages (leia antes de confiar nos lembretes)

O GitHub Pages só hospeda arquivos estáticos; não existe servidor rodando por trás. Por isso, sem configuração extra, **o navegador só consegue disparar lembretes enquanto o app estiver aberto** em alguma aba ou janela (pode estar minimizado ou em segundo plano). O app não finge o contrário: a tela de Configurações mostra qual modo está ativo.

| Modo | Funciona com o app fechado? | Configuração |
| --- | --- | --- |
| Lembrete local | Não. Precisa de uma aba ou janela aberta, mesmo minimizada | Nenhuma |
| Periodic Background Sync | Às vezes. Só Chrome/Edge com o app instalado; o navegador decide quando verificar (em geral no máximo algumas vezes por dia) | Nenhuma, é automático quando disponível |
| **Push real** | **Sim**, inclusive no celular bloqueado | Supabase gratuito (abaixo), cerca de 20 minutos |

Ao reabrir o app depois de um tempo fechado, se o lembrete estiver atrasado ele é enviado na hora (respeitando a janela de horário).

---

## Push notifications reais (opcional, gratuito)

### Como funciona

```
App (celular/PC) ──(assinatura push + resumo das tarefas abertas)──► Supabase Edge Function "lembretes"
                                                                          │  grava na tabela push_devices
Agendador a cada 15 min (pg_cron ou GitHub Actions) ──(action: send)──────┘
                                                                          │  verifica janela/frequência
                                                                          ▼
                                     Serviço de push do navegador ──► Notificação no dispositivo
```

- Cada alteração nas tarefas envia ao servidor um **resumo** das tarefas abertas (título, área, status, prioridade, prazo, cobrança). Concluídas não são enviadas.
- O agendador chama a função a cada 15 minutos; ela calcula, no seu fuso horário, se é hora de notificar, monta o mesmo texto do app e envia o Web Push.
- Com o push ativo, os lembretes locais são desligados automaticamente para não duplicar.

### Onde ficam os segredos (nenhum vai para o GitHub)

| Item | Onde fica | É secreto? |
| --- | --- | --- |
| `VAPID_PRIVATE_KEY` | Secrets do Supabase | **Sim** |
| `APP_TOKEN` | Secrets do Supabase + campo "Token de acesso" no app (salvo só no seu dispositivo) + secret do GitHub Actions (se usar) | **Sim** |
| `SUPABASE_SERVICE_ROLE_KEY` | Já existe dentro do Supabase, nunca sai de lá | **Sim** |
| `VAPID_PUBLIC_KEY` | Secrets do Supabase + campo no app | Não, é pública por definição |
| URL da função | Campo no app | Não |

A tabela tem RLS ativado sem nenhuma política: ninguém consegue ler ou gravar pela API pública do Supabase. Só a Edge Function, que valida o `APP_TOKEN`, acessa os dados.

### Passo a passo (Supabase, plano gratuito)

**1. Criar o projeto**
Crie uma conta em [supabase.com](https://supabase.com) e um novo projeto (região São Paulo, se disponível). Anote o **Project Ref** (aparece na URL `https://SEU-PROJETO.supabase.co`).

**2. Criar a tabela**
No painel: **SQL Editor → New query**, cole o conteúdo de `backend/supabase/schema.sql` e execute.

**3. Gerar as chaves VAPID e o token** (no seu computador, com Node.js instalado)
```bash
npx web-push generate-vapid-keys
# Anote a Public Key e a Private Key

# Token pessoal aleatório:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**4. Publicar a função**
Instale a CLI do Supabase ([guia oficial](https://supabase.com/docs/guides/cli)) e, na pasta `backend/`:
```bash
supabase login
supabase link --project-ref SEU-PROJETO

supabase secrets set \
  APP_TOKEN="SEU_TOKEN" \
  VAPID_PUBLIC_KEY="SUA_CHAVE_PUBLICA" \
  VAPID_PRIVATE_KEY="SUA_CHAVE_PRIVADA" \
  VAPID_SUBJECT="mailto:seu-email@exemplo.com"

supabase functions deploy lembretes --no-verify-jwt
```
O `--no-verify-jwt` é necessário porque a função é protegida pelo `APP_TOKEN`, e não pelo login do Supabase.

A URL da função será `https://SEU-PROJETO.supabase.co/functions/v1/lembretes`.

**5. Agendar os disparos** (escolha **um**)

- **Opção A, pg_cron (recomendada, mais pontual)**: em **Database → Extensions**, ative `pg_cron` e `pg_net`. Abra `backend/supabase/cron.sql`, troque `SEU-PROJETO` e `SEU_APP_TOKEN` **somente no SQL Editor** (não faça commit do token) e execute.
- **Opção B, GitHub Actions**: em **Settings → Secrets and variables → Actions** do repositório, crie `PUSH_FUNCTION_URL` e `PUSH_APP_TOKEN`. Depois, em `.github/workflows/lembretes.yml`, remova o `#` das linhas `schedule` e faça commit. Gratuito em repositório público; o GitHub pode atrasar alguns minutos e pausa agendamentos após 60 dias sem commits.

**6. Ativar no app**
Em cada dispositivo (celular e computador): **Configurações → Push com o app fechado**, preencha URL da função, token e chave pública VAPID, clique em **Ativar push** e depois em **Testar push**.

No iPhone, faça isso com o app aberto pela Tela de Início.

### Limites do plano gratuito
O uso pessoal fica muito abaixo dos limites gratuitos do Supabase (Edge Functions e banco). Projetos gratuitos sem nenhuma atividade por cerca de uma semana podem ser pausados pelo Supabase; como o agendador chama a função a cada 15 minutos, o projeto fica ativo.

### E o Firebase?
Também é possível usar Firebase Cloud Messaging, mas os disparos agendados (Cloud Functions com agendamento) exigem o plano Blaze, com cartão cadastrado. Por isso a opção pronta aqui é o Supabase, que faz tudo no plano gratuito. A estrutura do app (assinatura no service worker + resumo enviado ao servidor) é a mesma; mudaria apenas o backend.

### Sincronização entre dispositivos (próximo passo)
Hoje o servidor recebe só um resumo para enviar lembretes. Para sincronizar as tarefas completas entre computador e celular, o caminho é: criar uma tabela `tasks` no mesmo projeto Supabase, ativar o Supabase Auth (login por e-mail) com políticas RLS por usuário, e escrever um adaptador em `js/storage.js` que grave lá além do IndexedDB.

---

## Solução de problemas

- **Não chegam notificações**: confira a permissão em Configurações; no Windows/macOS, verifique se o "Não perturbe" ou o foco do sistema estão bloqueando o navegador.
- **Notificações bloqueadas**: clique no cadeado ao lado do endereço → Notificações → Permitir.
- **Alterações no código não aparecem**: aumente `CACHE_VERSION` no `service-worker.js` e reabra o app.
- **Push com erro 401**: o token no app é diferente do `APP_TOKEN` do Supabase.
- **Push parou de chegar**: o navegador pode ter renovado a assinatura. Em Configurações, clique em **Desativar push** e **Ativar push** novamente.
