# Central de Tarefas

Painel para organizar e acompanhar demandas profissionais. Cada pessoa cria a própria central, com nome e áreas escolhidos por ela, e recebe um **link exclusivo**. Abrindo esse link no computador ou no celular, as tarefas, as áreas e as configurações de lembrete são as mesmas em todos os dispositivos.

O site é estático e roda gratuitamente no **GitHub Pages**. Os dados ficam num banco gratuito no **Supabase**, que também envia as notificações push (funcionam com o app e o navegador fechados).

---

## Como funciona para quem usa

1. Abre o site e cai na **página inicial**: dá um nome para a central (ex.: "Tarefas do Edu") e cadastra as áreas (ex.: Sócio Torcedor, CRM, Propostas).
2. Clica em **Criar minha central** e recebe um link no formato `https://SEU-USUARIO.github.io/central-tarefas/?c=CODIGO`.
3. Abre esse mesmo link no celular e no computador. Tudo fica sincronizado.
4. Em **Configurações → Notificações neste dispositivo**, ativa os lembretes em cada aparelho.

**Sobre o link:** ele funciona como chave. Quem tiver o link consegue ver e editar a central. Por isso, compartilhe só com quem você quiser. Você pode abrir a central de outra pessoa se ela te passar o link dela; a página inicial lista as centrais já abertas no dispositivo.

### O que fica salvo na central (igual em todos os dispositivos)
Tarefas, histórico, nome da central, áreas (nomes e cores) e configurações de lembrete (ligado/desligado, frequência e horário).

### O que é de cada dispositivo
Tema (claro/escuro/automático), a ativação das notificações e a lista de centrais recentes.

### Funciona offline?
Sim. O app guarda uma cópia no dispositivo. Sem internet, você continua usando normalmente; o indicador no topo mostra "Offline" e as alterações são enviadas quando a conexão voltar. Se a mesma tarefa for editada em dois aparelhos, vale a alteração mais recente.

---

## Funcionalidades

- Dashboard com resumo do dia, indicadores (pendentes, em andamento, aguardando retorno, atrasadas, concluídas), produtividade do dia e contador por área.
- Organização automática em Atrasadas, Hoje, Próximas, Aguardando retorno, Sem prazo e Concluídas recentemente, com ordenação por atraso, urgência, prazo e prioridade.
- "Aguardando retorno" com pessoa/empresa, data de início e data de cobrança; no dia da cobrança a tarefa volta ao topo e entra nos lembretes.
- Filtros combináveis por situação e área, e busca por texto.
- Cadastro rápido, edição rápida no card (status, prioridade, prazo), histórico com restaurar e excluir definitivamente, desfazer.
- Áreas personalizáveis: adicionar, renomear, trocar cor e excluir (as tarefas são movidas para outra área).
- Lembretes com resumo útil: quantas atrasadas, urgentes, para hoje e próximas, e as três principais.
- Modo claro, escuro ou automático. Atalhos: `N` nova tarefa, `/` busca, `Ctrl/Cmd + Enter` salva.
- PWA instalável; o app instalado abre direto na última central usada.
- Backup em JSON (exportar e importar) e importação das tarefas da versão anterior.

---

## Estrutura dos arquivos

```
/
├── index.html                 Página inicial, telas da central e diálogos
├── manifest.json              Configuração do PWA
├── service-worker.js          Cache offline, recebimento de push e lembrete em segundo plano
├── .nojekyll
├── css/styles.css
├── js/
│   ├── config.js              ⚠️ Endereço da função do Supabase (editar uma vez)
│   ├── core.js                Regras compartilhadas com o service worker (datas, ordenação, resumo)
│   ├── api.js                 Comunicação com o servidor
│   ├── sync.js                Sincronização: cache local, fila offline e atualização periódica
│   ├── storage.js             Armazenamento local, preferências do dispositivo e backup
│   ├── tasks.js               Operações com tarefas, filtros e indicadores
│   ├── notifications.js       Ativação de notificações por dispositivo (push e reserva local)
│   ├── ui.js                  Geração do HTML
│   └── app.js                 Inicialização, página inicial, rotas, eventos e configurações
├── assets/                    Ícones
└── backend/supabase/
    ├── schema.sql             Tabelas
    ├── cron.sql               Agendador dos lembretes
    └── functions/api/index.ts Função única do servidor
```

---

## Instalação (uma vez)

São duas partes: o **servidor** no Supabase e o **site** no GitHub Pages. Leva cerca de 30 minutos e não precisa instalar nada no computador.

### Parte 1: Supabase

**1. Criar o projeto**
Crie uma conta em [supabase.com](https://supabase.com) e um **New project** (região South America, São Paulo). Anote o código do projeto: é a parte `xxxx` do endereço `https://xxxx.supabase.co` (aparece em Project Settings).

**2. Criar as tabelas**
No menu lateral, **SQL Editor → New query**. Cole todo o conteúdo de `backend/supabase/schema.sql` e clique em **Run**.

**3. Gerar as chaves de notificação**
Abra qualquer site no Chrome, aperte **F12**, vá na aba **Console**, cole o código abaixo e aperte Enter (se o Chrome bloquear, digite `allow pasting` e cole de novo):

```js
(async()=>{const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const pub=b64(await crypto.subtle.exportKey('raw',k.publicKey));const priv=(await crypto.subtle.exportKey('jwk',k.privateKey)).d;const tok=b64(crypto.getRandomValues(new Uint8Array(32)));console.log('VAPID_PUBLIC_KEY='+pub+'\nVAPID_PRIVATE_KEY='+priv+'\nCRON_SECRET='+tok);})();
```

Copie as três linhas para um Bloco de Notas. **A chave privada e o CRON_SECRET são segredos**: não coloque no GitHub nem mande para ninguém.

**4. Cadastrar os segredos**
Em **Edge Functions → Secrets**, adicione:

| Nome | Valor |
| --- | --- |
| `VAPID_PUBLIC_KEY` | a chave pública gerada |
| `VAPID_PRIVATE_KEY` | a chave privada gerada |
| `CRON_SECRET` | o CRON_SECRET gerado |
| `VAPID_SUBJECT` | `mailto:seu-email@exemplo.com` |

**5. Criar a função**
1. **Edge Functions → Deploy a new function → Via Editor**.
2. Nome exato: **`api`**.
3. Apague o código de exemplo, cole todo o conteúdo de `backend/supabase/functions/api/index.ts` e clique em **Deploy**.
4. Nos detalhes da função, **desligue "Verify JWT"** (ou "Enforce JWT verification") e salve. Sem isso o site recebe erro 401.
5. Copie a URL da função: `https://xxxx.supabase.co/functions/v1/api`.

**6. Ligar o agendador dos lembretes**
1. **Database → Extensions**: ative **pg_cron** e **pg_net**.
2. **SQL Editor → New query**: cole o conteúdo de `backend/supabase/cron.sql`, troque `SEU-PROJETO` e `SEU_CRON_SECRET` **só ali no editor** (não altere o arquivo do GitHub) e clique em **Run**.

### Parte 2: GitHub Pages

1. No GitHub, edite o arquivo **`js/config.js`** (ícone de lápis) e troque `SEU-PROJETO` pelo código do seu projeto Supabase. Faça o commit. Essa URL não é secreta.
2. Em **Settings → Pages**, use **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Abra `https://SEU-USUARIO.github.io/central-tarefas/`, crie sua central e guarde o link.

**Ao enviar arquivos pelo navegador:** arraste as pastas `css`, `js`, `assets` e `backend` do Windows Explorer para a área de upload, para manter a estrutura. O botão "choose your files" não envia pastas.

---

## Atualizando de uma versão anterior

1. Substitua no repositório todos os arquivos pelos desta versão (inclusive a pasta `js` inteira, que ganhou `config.js`, `api.js` e `sync.js`).
2. Se você já tinha criado a função `lembretes` ou a tabela `push_devices` no Supabase, pode excluir a função; o `schema.sql` novo remove a tabela antiga. O segredo `APP_TOKEN` não é mais usado.
3. Ao criar sua central na página inicial, marque **Importar as tarefas salvas neste navegador** para trazer o que você já tinha cadastrado. Também dá para importar depois em **Configurações → Backup**.

## Como atualizar o site no futuro

Edite os arquivos no GitHub e aumente `CACHE_VERSION` no topo do `service-worker.js` (ex.: `v2.0.0` → `v2.0.1`) para que os aparelhos com o app instalado baixem a nova versão. As tarefas não são afetadas.

## Como executar localmente

```bash
python3 -m http.server 8080
```
Abra `http://localhost:8080`. O site usa a função do Supabase configurada em `js/config.js`.

---

## Notificações

- As configurações de lembrete (ligado, frequência, horário inicial e final) ficam na central e valem para todos os aparelhos. Padrão: a cada 2 horas, das 08:00 às 20:00.
- Cada aparelho ativa as notificações uma vez em **Configurações → Notificações neste dispositivo**.
- Com o servidor configurado, o aparelho recebe **push**: os lembretes chegam com o app e o navegador fechados, inclusive no celular bloqueado. O agendador verifica a cada 15 minutos e envia conforme a frequência escolhida, no fuso horário do aparelho.
- Se o push não estiver disponível no navegador, o app usa a **reserva local**: mostra os lembretes enquanto estiver aberto em alguma aba ou janela, mesmo minimizado.
- **iPhone:** o push só funciona com o app instalado (Safari → Compartilhar → Adicionar à Tela de Início) e aberto pelo ícone, no iOS 16.4 ou superior.
- Tarefas "Aguardando retorno" só entram nos lembretes no dia da cobrança. Se nada depender de você, nenhuma notificação é enviada.

---

## Segurança e privacidade

- Nenhum segredo fica no repositório. As chaves privadas ficam só nos Secrets do Supabase.
- As tabelas têm RLS ativo **sem políticas**: a API pública do Supabase não acessa nada. Todo acesso passa pela função `api`, que exige o código da central.
- O código de cada central tem 24 caracteres aleatórios, o que o torna impossível de adivinhar. Mesmo assim, trate o link como uma senha.
- Qualquer pessoa que abrir o site consegue criar uma central nova. Para uso pessoal e de equipe isso não é problema; o plano gratuito do Supabase comporta com folga.

## Limites do plano gratuito do Supabase

O uso de uma pessoa ou de uma equipe pequena fica muito abaixo dos limites gratuitos (banco de 500 MB e centenas de milhares de chamadas de função por mês). Com o app aberto, ele busca atualizações a cada 30 segundos. Projetos gratuitos parados por uma semana podem ser pausados, mas o agendador dos lembretes mantém o projeto ativo.

---

## Solução de problemas

- **"Servidor não configurado"**: o `js/config.js` ainda tem `SEU-PROJETO`.
- **"Não foi possível abrir a central" com erro 401**: a opção Verify JWT da função continua ligada.
- **"Central não encontrada"**: o link está incompleto ou é de outro projeto Supabase.
- **Indicador "Erro ao sincronizar"**: passe o mouse sobre ele para ver a mensagem do servidor. Em Supabase → Edge Functions → api → Logs aparecem os detalhes.
- **Notificações não chegam**: confira a permissão do navegador, se o agendador está ativo (`select * from cron.job;` no SQL Editor) e se os Secrets estão preenchidos. Desative e ative de novo em Configurações.
- **Site sem visual**: as pastas `css` e `js` não foram enviadas ao GitHub; veja "Ao enviar arquivos pelo navegador".
