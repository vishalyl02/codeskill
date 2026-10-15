export function positiveInteger(
  name: string,
  fallback: number,
  min = 1,
  max = 1000000,
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}

export function providerUrls(name: string, fallback: string): string[] {
  let values: unknown;
  try {
    values = process.env[`${name}S`]
      ? JSON.parse(process.env[`${name}S`]!)
      : [process.env[name] || fallback];
  } catch {
    throw new Error(`Invalid ${name}S; use a JSON array of URLs`);
  }
  if (!Array.isArray(values) || !values.length || values.length > 8)
    throw new Error(`Configure between 1 and 8 ${name} endpoints`);
  const urls = values.map((value: unknown) => {
    if (typeof value !== 'string') throw new Error(`Invalid ${name}`);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Invalid ${name}`);
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(`Invalid ${name}`);
    return value.replace(/\/$/, '');
  });
  if (new Set(urls).size !== urls.length)
    throw new Error(`Duplicate ${name} endpoints`);
  return urls;
}
