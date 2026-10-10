import type { QuerySpec, Row, Result } from './types';
export class Query implements PromiseLike<Result<Row[]>> {
  spec: QuerySpec;
  constructor(table: string, private execute: (spec: QuerySpec) => Promise<Result<Row[]>>) { this.spec = {table, action:'select', columns:'*',filters:[],orders:[]}; }
  select(columns='*') {this.spec.columns=columns;return this;}
  eq(column:string,value:unknown) {this.spec.filters.push({column,op:'eq',value});return this;}
  is(column:string,value:unknown) {this.spec.filters.push({column,op:'is',value});return this;}
  in(column:string,value:unknown[]) {this.spec.filters.push({column,op:'in',value});return this;}
  lt(column:string,value:unknown) {this.spec.filters.push({column,op:'lt',value});return this;}
  or(value:string) {this.spec.or=value;return this;}
  order(column:string,options?:{ascending?:boolean}) {this.spec.orders.push({column,ascending:options?.ascending!==false});return this;}
  limit(value:number) {this.spec.limit=value;return this;}
  insert(values:Row|Row[]) {this.spec.action='insert';this.spec.values=values;return this;}
  update(values:Row) {this.spec.action='update';this.spec.values=values;return this;}
  upsert(values:Row|Row[],options?:{onConflict?:string}) {this.spec.action='upsert';this.spec.values=values;this.spec.conflict=options?.onConflict;return this;}
  delete() {this.spec.action='delete';return this;}
  async single():Promise<Result<Row>> {const r=await this.execute(this.spec);return {data:r.data?.[0]??null,error:r.error??(r.data?.length!==1?{message:'记录不存在或不唯一'}:null)};}
  async maybeSingle():Promise<Result<Row>> {const r=await this.execute(this.spec);return {data:r.data?.[0]??null,error:r.error??(r.data?.length>1?{message:'结果不唯一'}:null)};}
  then<TResult1 = Result<Row[]>, TResult2 = never>(onfulfilled?: ((value:Result<Row[]>)=>TResult1|PromiseLike<TResult1>)|null,onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null):PromiseLike<TResult1|TResult2> {return this.execute(this.spec).then(onfulfilled,onrejected);}
}
