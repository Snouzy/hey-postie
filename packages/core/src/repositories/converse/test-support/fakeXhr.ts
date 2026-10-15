/**
 * Stands in for `window.XMLHttpRequest` in the upload tests: Converse PUTs the file through XHR
 * (`shared/message.js` `uploadFile`), reads `xhr.upload` progress events and `readyState === DONE`.
 * Every request reports half, then the whole file, then completes with `nextStatus`.
 */
export class FakeXmlHttpRequest {
  static readonly DONE = 4;
  static nextStatus = 201;
  static last: { method: string; url: string; headers: Record<string, string> } | null = null;

  readonly upload = new EventTarget();
  readyState = 0;
  status = 0;
  responseText = '';
  onreadystatechange: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private request = { method: '', url: '', headers: {} as Record<string, string> };

  static install(): void {
    Object.assign(window, { XMLHttpRequest: FakeXmlHttpRequest });
  }

  open(method: string, url: string): void {
    this.request = { method, url, headers: {} };
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string): void {
    this.request.headers[name] = value;
  }

  send(body: Blob): void {
    FakeXmlHttpRequest.last = this.request;
    const total = body.size;
    setTimeout(() => {
      this.progress(total / 2, total);
      this.progress(total, total);
      this.readyState = FakeXmlHttpRequest.DONE;
      this.status = FakeXmlHttpRequest.nextStatus;
      this.onreadystatechange?.(new Event('readystatechange'));
    }, 0);
  }

  private progress(loaded: number, total: number): void {
    this.upload.dispatchEvent(
      new ProgressEvent('progress', { loaded, total, lengthComputable: true }),
    );
  }
}
