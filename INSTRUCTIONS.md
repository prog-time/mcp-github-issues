# Инструкция по использованию mcp-github-issues

## Что это такое

mcp-github-issues — это MCP-сервер (Model Context Protocol) для управления GitHub Issues через AI-ассистентов (Claude Desktop, Claude Code, PhpStorm). Сервер позволяет создавать, просматривать, комментировать и обновлять Issues в нескольких репозиториях — всё это через диалог с ИИ.

Ключевой принцип: **ИИ предлагает — вы подтверждаете**. Перед публикацией Issue ассистент формирует его содержание (заголовок, контекст, файлы, чеклист) и показывает вам. Issue создаётся в GitHub только после явного подтверждения — это предотвращает случайную публикацию.

---

## Требования

- **Node.js** 18+ (рекомендуется 20+)
- **npm** (поставляется вместе с Node.js)
- **GitHub Personal Access Token** с правами `repo` (для приватных репозиториев) или `public_repo` (для публичных)
- Один из MCP-клиентов: Claude Desktop, Claude Code CLI или IDE с поддержкой MCP (PhpStorm, VS Code)

---

## Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/prog-time/mcp-github-issues.git
cd mcp-github-issues
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка токена GitHub

Скопируйте файл-пример и вставьте свой токен:

```bash
cp .env.example .env
```

Отредактируйте `.env`, указав ваш Personal Access Token:

```env
GITHUB_TOKEN=ghp_ваш_токен_здесь
```

Если для разных проектов используются разные токены, укажите несколько переменных:

```env
GITHUB_TOKEN=ghp_основной_токен
GITHUB_TOKEN_PRIVATE=ghp_токен_для_приватных_репо
```

**Как получить токен:** GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token. Выберите scope `repo`.

### 4. Настройка проектов

Скопируйте пример и настройте под свои репозитории:

```bash
cp projects.yaml.example projects.yaml
```

Формат `projects.yaml`:

```yaml
projects:
  имя-проекта:
    owner: владелец-или-организация   # GitHub username или org
    repo: название-репозитория        # Имя репо на GitHub
    tokenEnv: GITHUB_TOKEN            # Имя переменной из .env
```

Пример с несколькими проектами:

```yaml
projects:
  backend:
    owner: myorg
    repo: api-server
    tokenEnv: GITHUB_TOKEN

  frontend:
    owner: myorg
    repo: web-client
    tokenEnv: GITHUB_TOKEN

  private-project:
    owner: myuser
    repo: secret-repo
    tokenEnv: GITHUB_TOKEN_PRIVATE
```

---

## Подключение к MCP-клиенту

### Автоматическая установка (рекомендуется)

Скрипт `mcp.sh` установит зависимости и зарегистрирует сервер в Claude CLI:

```bash
chmod +x mcp.sh
./mcp.sh setup
```

По умолчанию сервер регистрируется с именем `mcp-github-issues` в scope `user`. Можно переопределить:

```bash
./mcp.sh setup my-server-name project
```

Параметры:
- **name** — имя MCP-сервера (по умолчанию: `mcp-github-issues`)
- **scope** — область видимости: `local`, `user` или `project` (по умолчанию: `user`)

### Ручная настройка для Claude Desktop

Добавьте в `claude_desktop_config.json` (обычно `~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mcp-github-issues": {
      "command": "/абсолютный/путь/к/mcp-github-issues/mcp.sh",
      "env": {
        "GITHUB_TOKEN": "ghp_ваш_токен"
      }
    }
  }
}
```

### Ручная настройка для Claude Code

```bash
claude mcp add -s user -- mcp-github-issues /путь/к/mcp-github-issues/mcp.sh
```

### Ручная настройка для PhpStorm / VS Code

Каждая IDE имеет свой формат конфигурации MCP. Укажите путь к `mcp.sh` как команду запуска сервера.

После настройки **перезапустите IDE или Claude Desktop** для подключения сервера.

---

## Доступные инструменты (Tools)

Сервер предоставляет 6 инструментов, которые AI-ассистент может вызывать в диалоге.

### list_projects

Показывает список всех настроенных проектов из `projects.yaml`.

**Вход:** нет параметров.

**Пример использования:**
> «Покажи мои проекты»

### publish_issue

Создаёт GitHub Issue с заголовком, контекстом, списком файлов и чеклистом. Вызывается только после подтверждения пользователя.

**Параметры:**

| Параметр   | Тип      | Обязательный | Описание                                  |
|-----------|----------|:------------:|-------------------------------------------|
| project   | string   | да           | Имя проекта из projects.yaml              |
| title     | string   | да           | Заголовок Issue (без префикса типа)       |
| context   | string   | да           | Описание / контекст задачи                |
| files     | string[] | нет          | Список затронутых файлов                  |
| checklist | string[] | нет          | Чеклист подзадач                          |
| assignee  | string   | нет          | GitHub-юзернейм исполнителя              |
| type      | string   | нет          | Тип: `bug`, `feature` или `task` (по умолчанию: `task`) |

**Маппинг типов на лейблы:** `bug` → `bug`, `feature` → `enhancement`, `task` → `task`

**Формат итогового тела Issue:**

```markdown
> [!NOTE]
> The task was generated using the MCP server — prog-time/mcp-github-issues

**Type**: bug
**Assignee**: @johndoe

## Context

После OAuth-колбэка пользователь редиректится на /login.

## Affected Files

- `src/auth/callback.ts`

## Checklist

- [ ] Воспроизвести баг
- [ ] Починить сессию
- [ ] Добавить тест
```

**Пример использования:**
> «Создай задачу в проекте backend: нужно добавить валидацию email в форме регистрации. Затронуты файлы src/validators.ts и src/routes/auth.ts»

### list_issues

Получает список Issues из GitHub-репозитория с фильтрацией.

**Параметры:**

| Параметр | Тип    | Обязательный | Описание                                         |
|---------|--------|:------------:|--------------------------------------------------|
| project | string | да           | Имя проекта из projects.yaml                     |
| state   | string | нет          | Фильтр: `open`, `closed` или `all` (по умолчанию: `open`) |
| label   | string | нет          | Фильтр по лейблу                                |
| assignee| string | нет          | Фильтр по исполнителю                           |
| limit   | number | нет          | Максимум записей, 1–100 (по умолчанию: 30)       |

**Пример использования:**
> «Покажи открытые баги в проекте frontend»

### fetch_issue

Получает полный контекст одного Issue: описание, метаданные и комментарии.

**Параметры:**

| Параметр         | Тип     | Обязательный | Описание                                          |
|-----------------|---------|:------------:|---------------------------------------------------|
| project         | string  | да           | Имя проекта из projects.yaml                      |
| issue           | string  | да           | Номер Issue (`123`) или полный URL                |
| include_comments| boolean | нет          | Загружать комментарии (по умолчанию: `true`)      |
| comment_limit   | number  | нет          | Макс. кол-во комментариев, 1–100 (по умолчанию: 50)|

**Пример использования:**
> «Покажи подробности Issue #42 в backend»

### add_comment

Добавляет комментарий к существующему Issue.

**Параметры:**

| Параметр | Тип    | Обязательный | Описание                           |
|---------|--------|:------------:|------------------------------------|
| project | string | да           | Имя проекта из projects.yaml       |
| issue   | string | да           | Номер Issue или полный URL         |
| body    | string | да           | Текст комментария (Markdown)       |

**Пример использования:**
> «Добавь комментарий к Issue #42: "Исправление будет в следующем релизе"»

### update_issue

Обновляет свойства существующего Issue: статус, заголовок, исполнителя, лейблы.

**Параметры:**

| Параметр      | Тип      | Обязательный | Описание                                   |
|--------------|----------|:------------:|--------------------------------------------|
| project      | string   | да           | Имя проекта из projects.yaml               |
| issue        | string   | да           | Номер Issue или полный URL                 |
| state        | string   | нет          | Новый статус: `open` или `closed`          |
| title        | string   | нет          | Новый заголовок                            |
| assignee     | string/null | нет       | Исполнитель (`null` — удалить)             |
| add_labels   | string[] | нет          | Лейблы для добавления                      |
| remove_labels| string[] | нет          | Лейблы для удаления                        |

**Пример использования:**
> «Закрой Issue #42 в backend и добавь лейбл "done"»

---

## Типичный рабочий процесс

### Шаг 1: Формулировка задачи

Попросите ИИ создать задачу:

> «Создай задачу для проекта backend: нужно мигрировать базу с MySQL на PostgreSQL. Затронуты файлы: src/database.ts, docker-compose.yml. Чеклист: обновить драйвер, изменить миграции, обновить docker-compose, протестировать»

### Шаг 2: Подтверждение

ИИ покажет вам содержимое будущего Issue (заголовок, тип, контекст, файлы, чеклист) и спросит подтверждение.

### Шаг 3: Публикация

Когда содержимое вас устраивает:

> «Да, публикуй и назначь на @username»

Сервер создаст Issue в GitHub и вернёт URL.

### Шаг 4: Работа с Issues

После публикации можно управлять задачами:

> «Покажи все открытые Issues в backend»
> «Добавь комментарий к Issue #15: Завершено, готово к ревью»
> «Закрой Issue #15»

---

## Структура проекта

```
mcp-github-issues/
├── src/                    # Исходный код
│   ├── server.ts           #   Точка входа MCP-сервера
│   ├── config.ts           #   Загрузка и валидация конфигурации
│   ├── logger.ts           #   Логирование (файл + stderr)
│   ├── router.ts           #   Регистрация всех инструментов
│   └── tools/              #   Реализация каждого инструмента
│       ├── listProjects.ts
│       ├── listIssues.ts
│       ├── fetchIssue.ts
│       ├── publish.ts
│       ├── addComment.ts
│       └── updateIssue.ts
├── tests/                  # Тесты (Vitest)
├── logs/                   # Логи сервера
├── projects.yaml           # Конфигурация проектов
├── .env                    # Токены GitHub (не в git)
├── mcp.sh                  # Скрипт запуска и установки
├── package.json
└── tsconfig.json
```

---

## Разработка

### Запуск в режиме разработки

```bash
npm run dev
```

Сервер запустится через `tsx` и будет использовать `StdioServerTransport` — для прямого тестирования подключите MCP-клиент.

### Сборка

```bash
npm run build
```

TypeScript компилируется в `dist/`. Запуск скомпилированного кода:

```bash
npm start
```

### Тесты

```bash
npm test              # Однократный запуск
npm run test:watch    # Наблюдение за изменениями
```

Тесты используют Vitest и покрывают конфигурацию, роутер и каждый инструмент.

### Линтинг

ESLint настроен с `typescript-eslint`. Запуск через CI (GitHub Actions) или вручную:

```bash
npx eslint src/ tests/
```

---

## Логирование и отладка

Сервер ведёт лог в двух местах:

- **Файл:** `logs/server.log` — полный лог работы сервера
- **stderr** — перехватывается Claude Desktop для отображения ошибок

Если сервер не подключается или инструменты не работают:

1. Проверьте `logs/server.log` на наличие ошибок
2. Убедитесь, что `projects.yaml` корректен (все поля заполнены)
3. Убедитесь, что токен в `.env` валиден и имеет нужные права
4. Перезапустите IDE / Claude Desktop после изменения конфигурации

---

## CI/CD

Проект включает GitHub Actions workflow (`.github/workflows/ci.yml`) с тремя проверками на каждый push и PR в `main`:

1. **ESLint** — проверка стиля кода
2. **Tests** — запуск всех тестов Vitest
3. **TypeScript** — проверка типов

---

## Безопасность

- Файл `.env` с токенами **не попадает в git** (указан в `.gitignore`)
- Файл `projects.yaml` исключён из git (содержит конфигурацию проектов)
- Токены читаются из переменных окружения в момент вызова, не при старте сервера
- `publish_issue` создаёт Issue только при явном вызове — ИИ сначала формирует содержимое и получает подтверждение пользователя
