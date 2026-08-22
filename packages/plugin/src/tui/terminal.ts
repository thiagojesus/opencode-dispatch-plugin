import { Buffer } from "node:buffer"

import qrcode from "qrcode-terminal"

import { DispatchControlError } from "./types.ts"

type Osc52ClipboardInput = {
  readonly isTTY: boolean
  readonly multiplexed: boolean
  readonly write: (value: string) => void
}

function parseRemoteUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    if (error instanceof TypeError) throw new DispatchControlError("control_rejected")
    throw error
  }
  const sessionRoute = /^\/sessions(?:\/[A-Za-z0-9._%:-]+)?$/u.test(url.pathname)
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !sessionRoute
  ) {
    throw new DispatchControlError("control_rejected")
  }
  return url
}

export function renderRemoteQr(value: string): string {
  const url = parseRemoteUrl(value).toString()
  let output: string | undefined
  qrcode.generate(url, { small: true }, (rendered) => {
    output = rendered
  })
  if (output === undefined) throw new DispatchControlError("control_rejected")
  return output
}

export function createOsc52Clipboard(input: Osc52ClipboardInput): (value: string) => Promise<void> {
  return async (value) => {
    if (!input.isTTY) throw new DispatchControlError("control_rejected")
    const url = parseRemoteUrl(value).toString()
    const sequence = `\x1b]52;c;${Buffer.from(url, "utf8").toString("base64")}\x07`
    input.write(input.multiplexed ? `\x1bPtmux;\x1b${sequence}\x1b\\` : sequence)
  }
}

export const copyRemoteUrl = createOsc52Clipboard({
  isTTY: process.stdout.isTTY === true,
  multiplexed: (() => {
    const { TMUX: tmux, STY: screen } = process.env
    return tmux !== undefined || screen !== undefined
  })(),
  write: (value) => {
    process.stdout.write(value)
  },
})
