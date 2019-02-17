export function v8String(raw: string) {
  return `String::NewFromUtf8(isolate, "${raw}")`;
}

export function v8Number(raw: string) {
  return `Number::New(isolate, ${raw})`;
}
