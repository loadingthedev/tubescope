// Prefer the current name; existing installs may still use the original environment.
export const env = name => process.env[`TUBESCOPE_${name}`] ?? process.env[`TUBEDESK_${name}`];
