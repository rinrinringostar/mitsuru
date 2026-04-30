// Conservative shell command parser.
//
// Goal: distinguish "single, simple command" from "anything else".
//
// We do NOT attempt to be a full shell parser. If a command contains
// any operator, substitution, redirection, or control character that
// could change how the shell evaluates it, we return { kind: "complex" }
// and the caller will pass the command through unmodified (no rewrite,
// no compression). This eliminates the entire class of bugs where a
// custom tokenizer disagrees with the actual shell about whether a
// dangerous command is hiding behind another.
//
// Only when the command is provably a single simple command do we
// extract argv and allow downstream classification / compression.

// Characters whose presence in a command string forces us to treat the
// whole command as "complex" (passed through unmodified, never rewritten).
//
// Notes on what we deliberately DO NOT block:
//   - tab \t : treated as whitespace by tokenizeSimple, no security impact
//   - tilde ~ : commonly appears in legitimate git refs (HEAD~1) and paths;
//               bash tilde expansion is a benign syntactic feature
//   - bang !  : history expansion only fires in interactive shells, and
//               we always run via `bash -c`, so this is harmless
const COMPLEX_CHARS = [
  ";",   // command separator
  "&",   // background / && / &|
  "|",   // pipe / ||
  "\n",  // newline
  "\r",  // CR
  ">",   // redirection
  "<",   // redirection / heredoc / process substitution
  "(",   // subshell / command substitution part of $(...) / process subst
  ")",   //  "
  "{",   // brace group / brace expansion
  "}",   //  "
  "*",   // glob
  "?",   // glob
  "[",   // glob / test
  "]",   //  "
  "$",   // variable / command substitution
  "`"    // command substitution
];

const COMPLEX_SET = new Set(COMPLEX_CHARS);

export function parseCommand(input) {
  if (typeof input !== "string") {
    return { kind: "invalid", reason: "non-string input" };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { kind: "invalid", reason: "empty command" };
  }

  for (const ch of trimmed) {
    if (COMPLEX_SET.has(ch)) {
      return { kind: "complex", reason: `contains ${describeChar(ch)}` };
    }
    const code = ch.codePointAt(0);
    if (code !== undefined && code < 0x20 && code !== 0x09) {
      return { kind: "complex", reason: "contains control character" };
    }
  }

  const argv = tokenizeSimple(trimmed);
  if (argv === null) {
    return { kind: "complex", reason: "unbalanced quoting" };
  }
  if (argv.length === 0) {
    return { kind: "invalid", reason: "no tokens" };
  }
  return { kind: "simple", argv };
}

// Tokenize a simple command line that has already been verified
// not to contain any shell metacharacter. Supports:
//   - whitespace separation
//   - single-quoted strings: '...' (no escapes inside)
//   - double-quoted strings: "..." (only \" and \\ are honored)
//   - backslash escape outside quotes
//
// Returns null on unbalanced quoting.
function tokenizeSimple(input) {
  const tokens = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let hasContent = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      hasContent = true;
      escaped = false;
      continue;
    }
    if (ch === "\\" && !inSingle) {
      escaped = true;
      continue;
    }
    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
        hasContent = true;
      }
      continue;
    }
    if (inDouble) {
      if (ch === "\"") {
        inDouble = false;
      } else {
        current += ch;
        hasContent = true;
      }
      continue;
    }
    if (ch === "'") { inSingle = true; hasContent = true; continue; }
    if (ch === "\"") { inDouble = true; hasContent = true; continue; }
    if (ch === " " || ch === "\t") {
      if (hasContent) {
        tokens.push(current);
        current = "";
        hasContent = false;
      }
      continue;
    }
    current += ch;
    hasContent = true;
  }

  if (inSingle || inDouble || escaped) return null;
  if (hasContent) tokens.push(current);
  return tokens;
}

function describeChar(ch) {
  if (ch === "\n") return "newline";
  if (ch === "\r") return "carriage return";
  if (ch === "\t") return "tab";
  return `'${ch}'`;
}
