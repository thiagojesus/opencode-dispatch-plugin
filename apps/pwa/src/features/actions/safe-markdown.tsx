import { assertNever } from "@opencode-dispatch/contracts"
import type { Element, Root, RootContent } from "hast"
import { type Schema, sanitize } from "hast-util-sanitize"
import { fromMarkdown } from "mdast-util-from-markdown"
import { toHast } from "mdast-util-to-hast"
import { ArrowSquareOut, Check, Copy, WarningCircle } from "phosphor-solid"
import { createMemo, createSignal, type JSX } from "solid-js"

import { ActionButton } from "../../ui/action-button"

type SafeMarkdownProps = {
  readonly source: string
  readonly writeClipboard?: ((value: string) => Promise<void>) | undefined
}

type CodeBlockProps = {
  readonly code: string
  readonly writeClipboard: (value: string) => Promise<void>
}

type LinkPolicy =
  | { readonly href: string; readonly kind: "internal" }
  | {
      readonly href: string
      readonly kind: "external"
      readonly rel: "noopener noreferrer"
      readonly target: "_blank"
    }

const SAFE_MARKDOWN_SCHEMA = {
  attributes: {
    a: ["href"],
    code: [["className", /^language-[A-Za-z0-9_-]+$/u]],
  },
  protocols: {
    href: ["https"],
  },
  tagNames: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "ul",
  ],
} satisfies Schema

class ClipboardUnavailableError extends Error {
  override readonly name = "ClipboardUnavailableError"
}

async function writeBrowserClipboard(value: string): Promise<void> {
  if (navigator.clipboard === undefined) {
    throw new ClipboardUnavailableError("Clipboard access is unavailable")
  }
  await navigator.clipboard.writeText(value)
}

function linkPolicy(href: string): LinkPolicy | undefined {
  if (href.startsWith("/") || href.startsWith("#")) {
    return { href, kind: "internal" }
  }
  if (/^https:\/\//iu.test(href)) {
    return {
      href,
      kind: "external",
      rel: "noopener noreferrer",
      target: "_blank",
    }
  }
  return undefined
}

function textContent(node: RootContent): string {
  switch (node.type) {
    case "text":
      return node.value
    case "element":
      return node.children.map(textContent).join("")
    case "comment":
    case "doctype":
    case "raw":
      return ""
    default:
      return assertNever(node)
  }
}

function CodeBlock(props: CodeBlockProps): JSX.Element {
  const [copyState, setCopyState] = createSignal<"copied" | "failed" | "idle">("idle")
  const copy = async (): Promise<void> => {
    try {
      await props.writeClipboard(props.code)
      setCopyState("copied")
    } catch (error) {
      if (error instanceof Error) {
        setCopyState("failed")
        return
      }
      throw error
    }
  }

  return (
    <div class="markdown-code-block">
      <div class="markdown-code-block__header cluster">
        <span>Code</span>
        <ActionButton
          ariaLabel="Copy code"
          onClick={() => {
            void copy()
          }}
          variant="ghost"
        >
          {copyState() === "copied" ? (
            <Check aria-hidden="true" size={20} weight="bold" />
          ) : copyState() === "failed" ? (
            <WarningCircle aria-hidden="true" size={20} weight="bold" />
          ) : (
            <Copy aria-hidden="true" size={20} weight="bold" />
          )}
          {copyState() === "copied"
            ? "Code copied"
            : copyState() === "failed"
              ? "Copy unavailable"
              : "Copy code"}
        </ActionButton>
      </div>
      <pre>
        <code>{props.code}</code>
      </pre>
    </div>
  )
}

function renderNodes(
  nodes: readonly RootContent[],
  writeClipboard: (value: string) => Promise<void>,
): JSX.Element {
  return nodes.map((node) => renderNode(node, writeClipboard))
}

function renderElement(
  node: Element,
  writeClipboard: (value: string) => Promise<void>,
): JSX.Element {
  const children = renderNodes(node.children, writeClipboard)
  switch (node.tagName) {
    case "a": {
      const href = node.properties.href
      const policy = typeof href === "string" ? linkPolicy(href) : undefined
      if (policy === undefined) return <>{children}</>
      return policy.kind === "external" ? (
        <a
          class="markdown-external-link"
          href={policy.href}
          rel={policy.rel}
          target={policy.target}
        >
          {children}
          <ArrowSquareOut aria-hidden="true" size={16} weight="bold" />
          <span class="visually-hidden"> opens in a new tab</span>
        </a>
      ) : (
        <a href={policy.href}>{children}</a>
      )
    }
    case "blockquote":
      return <blockquote>{children}</blockquote>
    case "br":
      return <br />
    case "code":
      return <code>{children}</code>
    case "del":
      return <del>{children}</del>
    case "em":
      return <em>{children}</em>
    case "h1":
    case "h2":
      return <h3>{children}</h3>
    case "h3":
    case "h4":
      return <h4>{children}</h4>
    case "h5":
    case "h6":
      return <h5>{children}</h5>
    case "hr":
      return <hr />
    case "li":
      return <li>{children}</li>
    case "ol":
      return <ol>{children}</ol>
    case "p":
      return <p>{children}</p>
    case "pre": {
      const rawCode = textContent(node)
      const code = rawCode.endsWith("\n") ? rawCode : `${rawCode}\n`
      return <CodeBlock code={code} writeClipboard={writeClipboard} />
    }
    case "strong":
      return <strong>{children}</strong>
    case "ul":
      return <ul>{children}</ul>
    default:
      return <>{children}</>
  }
}

function renderNode(
  node: RootContent,
  writeClipboard: (value: string) => Promise<void>,
): JSX.Element {
  switch (node.type) {
    case "text":
      return node.value
    case "element":
      return renderElement(node, writeClipboard)
    case "comment":
    case "doctype":
    case "raw":
      return null
    default:
      return assertNever(node)
  }
}

function sanitizedRoot(source: string): Root {
  const tree = sanitize(toHast(fromMarkdown(source)), SAFE_MARKDOWN_SCHEMA)
  if (tree.type !== "root") {
    throw new TypeError("Markdown conversion must produce a root node")
  }
  return tree
}

export function SafeMarkdown(props: SafeMarkdownProps): JSX.Element {
  const tree = createMemo(() => sanitizedRoot(props.source))
  const writeClipboard = props.writeClipboard ?? writeBrowserClipboard

  return <div class="safe-markdown stack">{renderNodes(tree().children, writeClipboard)}</div>
}
