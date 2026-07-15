---

# CLI & Terminal Reference

Terminal UI is the last frontier AI hasn't ruined yet, mostly because LLMs barely
know it exists. No "modern CLI starter kit" on Dribbble. No Pinterest boards. You
can still build with actual craft here — if you respect the medium.

The terminal is not a downgraded browser. 80 columns. 256 colors if you're lucky.
No mouse. Your users are devs who will judge you harder than any design review.
يسطا, treat it with respect.

---

## Framework Selection

Not every CLI needs a TUI framework. `echo` and exit codes get you surprisingly far.
But when you do need structure:

| Language | Framework | Description | Best For | Used By |
|----------|-----------|-------------|----------|---------|
| Go | **Bubble Tea** (Charm) | Elm Architecture for terminals. Lip Gloss styling, Bubbles components, Huh forms, Gum for shell scripts | Production CLIs, complex TUIs | `gh`, `soft-serve`, `glow` |
| Rust | **Ratatui** | Sub-ms rendering, Flexbox-inspired layouts, immediate-mode | Performance-critical dashboards | `gitui`, `bottom` |
| Python | **Textual** | CSS-like `.tcss` stylesheets, component tree, runs in terminal AND browser via `textual-web` | Python dev tools, rapid prototyping | `trogon`, `posting`, `toolong` |
| Python | **Rich** | Tables, progress bars, markdown, syntax highlighting. Output library, not a TUI | Simple CLI output, pretty-printing | `pip`, `httpie`, `typer` |
| JS/TS | **Clack** (`@clack/prompts`) | Modern prompts, 5.6M weekly downloads, 80% smaller than Inquirer | Node CLI, setup wizards | `create-svelte`, `create-astro` |
| JS/TS | **Ink** | React components in terminal via Yoga Flexbox. Full React model | Complex TUI with React knowledge | `pastel`, `wrangler` |
| Rust | **crossterm** | Lower-level terminal manipulation — raw mode, events, colors, cross-platform | Custom rendering below Ratatui | Ratatui's own dependency |
| Go | **cobra** + **lipgloss** | cobra for arg parsing, lipgloss for styled output. Not a TUI | Traditional flag-based CLIs | `kubectl`, `hugo`, `helm` |

**Selection heuristic**: Mostly prompts and output → Rich/Clack/Gum. Persistent
interactive UI → Bubble Tea/Ratatui/Textual. Quick script → stdlib, احا don't over-engineer it.

---

## Terminal Color Systems

Three tiers. You handle all of them because someone is SSH'd into a VPS with xterm-16color.

**16-color ANSI** (universal) — 8 colors + 8 bright. Remapped by user's theme — your "red"
becomes their Catppuccin/Solarized red. This is a feature, not a bug.

**256-color** — 16 ANSI + 6x6x6 color cube (16-231) + 24-step grayscale (232-255).
Detected: `$TERM` contains `256color`.

**Truecolor 24-bit** — Full RGB. Detected: `$COLORTERM=truecolor` or `24bit`.
Supported: iTerm2, WezTerm, Windows Terminal, Ghostty, Alacritty, kitty.

```bash
if [ "$COLORTERM" = "truecolor" ] || [ "$COLORTERM" = "24bit" ]; then
    COLOR_DEPTH=24
elif [[ "$TERM" == *"256color"* ]]; then
    COLOR_DEPTH=8
else
    COLOR_DEPTH=4  # 16 colors
fi
```

**Color libraries**: picocolors (JS, 14x smaller than chalk), ansis (JS, tree-shakeable),
Lip Gloss (Go, adaptive fallbacks), crossterm (Rust), Rich (Python, auto-degrades).

### Domain Token Mapping (OKLCH to Terminal)

```python
# Adaptive palette — degrades gracefully across all three tiers
PALETTE = {
    "primary":  {"true": "#7C6FF0", "256": 99,  "ansi": "magenta"},
    "success":  {"true": "#2DD4A8", "256": 43,  "ansi": "green"},
    "error":    {"true": "#F43F5E", "256": 197, "ansi": "red"},
    "warning":  {"true": "#FBBF24", "256": 220, "ansi": "yellow"},
    "muted":    {"true": "#6B7280", "256": 242, "ansi": "bright_black"},
}
```

ANSI 0-15 are theme-controlled. Semantic names (`error`, `success`) matter more than
exact hex values. Don't fight the user's theme.

---

## Unicode Design Patterns

Unicode is your design toolkit. But not every terminal renders every codepoint —
test on Windows Terminal, macOS Terminal.app, and at least one Linux terminal.

### Box Drawing, Progress, Status

```
╭──────────────────────────╮
│  Status: ✓ All systems   │
│  Uptime: 47d 12h 03m     │
│  Load:   █████░░░░░ 48%  │
╰──────────────────────────╯
```

Corners: `╭ ╮ ╰ ╯` / Heavy: `┏ ┓ ┗ ┛` / Double: `╔ ╗ ╚ ╝`. Lines: `│ ─ ┃ ━ ║ ═`.

**Braille spinners**: `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏` — 10 frames at ~80ms. Smoother than `|/-\`.

**Progress**: `█` (full) + `░` (empty). Sub-char precision: `▏▎▍▌▋▊▉█` (1/8 increments).

**Status**: `✓` success, `✗` failure, `⚠` warning, `●` running, `○` stopped, `◆` selected.

### Tree Rendering

```
src/
├── commands/
│   ├── init.ts
│   └── deploy.ts
├── utils/
│   └── config.ts
└── index.ts
```

`├── └── │` with consistent 4-char indent per level.
هانت — looks simple but alignment breaks with fullwidth characters.

### Styled Output (Lip Gloss)

```go
accent   := lipgloss.AdaptiveColor{Light: "#7C3AED", Dark: "#A78BFA"}
boxStyle := lipgloss.NewStyle().
    BorderStyle(lipgloss.RoundedBorder()).
    BorderForeground(accent).Padding(0, 1)
title    := lipgloss.NewStyle().Foreground(accent).Bold(true)
// Render: boxStyle.Render(title.Render("Deploy Status") + "\n  ✓ api\n  ✗ db")
```

---

## Interaction Patterns

### Prompts

Five types cover 95% of CLI interactions:

- **Select** — Arrow keys, 5-7 visible items max, scroll if more
- **Multi-select** — Space to toggle, Enter to confirm, show selected count
- **Text** — Placeholder text, validate on submit not keystroke
- **Confirm** — `y/N` or `Y/n` — capitalized = default. Always have a default
- **Password** — Mask with `*` or hide entirely. Never echo

```typescript
// Clack — grouped prompt flow
import { intro, outro, select, text, spinner } from '@clack/prompts';
intro('Create new project');
const name = await text({ message: 'Project name?', placeholder: 'my-app' });
const tmpl = await select({ message: 'Template',
    options: [{ value: 'minimal', label: 'Minimal', hint: '3 files' },
              { value: 'full', label: 'Full', hint: 'with tests + CI' }] });
const s = spinner();
s.start('Scaffolding...'); await scaffold(name, tmpl); s.stop('Created');
outro('Done. cd ' + name + ' && npm install');
```

### Progressive Disclosure

1. Default: summary (3-5 lines)
2. `--verbose` / `-v`: detailed output
3. `--debug`: internal state, timings, raw responses
4. `--json`: machine-readable, pipe-friendly

### Error Display

Three parts, no exceptions:

```
✗ Failed to connect to database

  Connection refused: localhost:5432
  PostgreSQL might not be running.

  Try: sudo systemctl start postgresql
```

1. **What failed** — red + icon, one line
2. **Why** — the actual error, context
3. **What to do** — actionable, copy-pasteable command

### Keyboard Shortcuts

Footer bar for TUIs: ` q quit  ↑↓ navigate  enter select  / filter  ? help`

Dim key names, highlight actions. Max 6-8 shortcuts visible — `?` for full help.

---

## CLI Design Principles

**First 3 seconds** — User hits Enter. Within 3 seconds they must know: did it work,
is it still working, or did it fail and what to do? Print *something* within 200ms —
even just a spinner. Four seconds of silence = your user thinks it's broken.

**Progressive complexity** — Zero flags does the right thing 80% of the time:
```
myapp                       # sensible defaults
myapp --output json         # power user flag
myapp --config custom.yaml  # full control
```

**Color = information** — Red=error, Yellow=warning, Green=success, Blue=info, Gray=secondary.
If color doesn't carry semantic meaning, you're decorating. Stop.

**Respect NO_COLOR** — `no-color.org` standard. If set (any value), strip all ANSI.
No "but our brand" excuses. `const useColor = !process.env.NO_COLOR && process.stdout.isTTY;`

**Respect terminal width** — Never assume 80. Never assume infinity. Query and adapt.
Tables that overflow into wrapped garbage are a war crime.

**Piping support** — When `!stdout.isTTY`: no colors, no spinners, no progress bars.
Plain text, one item per line, every line `grep`-able.

```javascript
if (process.stdout.isTTY) {
    renderFancy(data);  // colors, spinners, progress
} else {
    data.forEach(item => console.log(item.id));  // clean, parseable
}
```

---

## Anti-Patterns

Things that make developers mass-uninstall your CLI. Collected from years of احا moments.

**1. Wall of Text** — 200 lines of unstructured output on every run. Nobody reads it.
Summary by default, `--verbose` for details, `--debug` for the firehose.

**2. Flags Required for Basic Operations** — If `myapp init` needs three mandatory flags,
your defaults are broken. Zero-flag invocation works for the common case. Prompt
interactively for anything you can't default.

**3. Missing or Useless --help** — "Usage: myapp [options]" with no examples is worse
than nothing. Every subcommand: one-line description, 2-3 examples with real values,
flags with defaults shown.

**4. Spinners Without Context** — Spinner with no text is anxiety. "Loading..." barely
better. Say *what*: "Fetching dependencies (3/12)..." — progress AND time estimate.

**5. Ignoring NO_COLOR** — Your gradient ASCII art means nothing to screen readers,
piped output, or CI. Respect `NO_COLOR`. Respect `isTTY`. This is accessibility.

**6. Non-Zero Exit Codes for Success** — Exit 0 = success, non-zero = failure. If you
exit 1 on success, every shell script, CI pipeline, and Makefile breaks. People still ship this.

**7. Interactive Prompts That Break Pipes** — `echo "yes" | myapp deploy` hangs forever
if your prompts don't detect non-TTY stdin. Check `stdin.isTTY`, accept piped input or
fail fast with a clear message.

**8. Clearing the Screen** — `clear` on startup destroys scroll history. Use alternate
screen buffer (`\e[?1049h`) — preserves terminal content, restores on exit. Bubble Tea
and Ratatui do this by default.

---

*CLI is where good defaults matter most. Your users will read your source code if
--help is unclear. Respect their time and their terminal.*