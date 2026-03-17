/**
 * @typedef {import('playwright').Page} Page
 */

/**
 * @typedef {{
 *  label: string,
 *  inputType: 'text'|'email'|'tel'|'number'|'date'|'select'|'radio'|'checkbox'|'file'|'textarea',
 *  required: boolean,
 *  options?: string[],
 *  signatureHash: string
 * }} Field
 */

/**
 * @typedef {{
 *  id: string,
 *  url: string,
 *  portalType: string,
 *  setState: (state: string) => void,
 *  setFields: (fields: Field[]) => void,
 *  setPendingFieldRequest: (req: { requestId: string, field: Field } | undefined) => void,
 *  setMeta: (metaPatch: any) => void,
 *  recordFilled: (item: { label: string, value: string|number|boolean }) => void,
 * }} JobContext
 */

/**
 * @typedef {{
 *  profileGet: () => any,
 *  customValueGet: (signatureHash: string) => any,
 *  customValueSet: (signatureHash: string, value: any) => void,
 * }} Stores
 */

/**
 * @typedef {{
 *  page: Page,
 *  job: JobContext,
 *  stores: Stores,
 *  awaitNeedField: (field: Field) => Promise<any>,
 *  submitGuardPatterns: RegExp[],
 * }} AdapterRunParams
 */

/**
 * @interface PortalAdapter
 * @property {string} name
 * @property {(url: string) => boolean} canHandle
 * @property {(params: AdapterRunParams) => Promise<void>} run
 */

export {};
