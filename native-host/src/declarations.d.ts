declare module 'screenshot-desktop' {
  function screenshot(options?: { screen?: number; format?: string }): Promise<Buffer>;
  export = screenshot;
}
