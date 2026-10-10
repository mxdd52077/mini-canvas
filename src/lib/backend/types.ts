/** Dynamic rows match the existing PostgREST-shaped calls while D1 enforces table/column allowlists. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type User = { id: string; email?: string; user_metadata: Record<string, unknown>; email_confirmed_at?: string };
export type Result<T = Row[]> = { data: T; error: { message: string } | null };
export type Filter = { column: string; op: 'eq' | 'is' | 'in' | 'lt'; value: unknown };
export type QuerySpec = { table: string; action: 'select' | 'insert' | 'update' | 'upsert' | 'delete'; columns: string; filters: Filter[]; orders: {column:string; ascending:boolean}[]; limit?: number; values?: Row | Row[]; conflict?: string; single?: boolean; optional?: boolean; or?: string };
