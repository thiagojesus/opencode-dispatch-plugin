declare module "qrcode-terminal" {
  type QrOptions = {
    readonly small?: boolean
  }

  type QrCodeTerminal = {
    generate(value: string, options: QrOptions, callback: (output: string) => void): void
  }

  const qrcode: QrCodeTerminal
  // biome-ignore lint/style/noDefaultExport: The CommonJS package exposes its API as the default import.
  export default qrcode
}
