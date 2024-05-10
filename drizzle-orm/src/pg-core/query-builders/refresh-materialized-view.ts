import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type {
	PgPreparedQuery,
	PgSession,
	PreparedQueryConfig,
	QueryResultHKT,
	QueryResultKind,
} from '~/pg-core/session.ts';
import type { PgMaterializedView } from '~/pg-core/view.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PgRefreshMaterializedView<TQueryResult extends QueryResultHKT>
	extends
		QueryPromise<QueryResultKind<TQueryResult, never>>,
		RunnableQuery<QueryResultKind<TQueryResult, never>, 'pg'>,
		SQLWrapper
{
	readonly _: {
		readonly dialect: 'pg';
		readonly result: QueryResultKind<TQueryResult, never>;
	};
}

export class PgRefreshMaterializedView<TQueryResult extends QueryResultHKT>
	extends QueryPromise<QueryResultKind<TQueryResult, never>>
	implements RunnableQuery<QueryResultKind<TQueryResult, never>, 'pg'>, SQLWrapper
{
	static readonly [entityKind]: string = 'PgRefreshMaterializedView';

	private config: {
		view: PgMaterializedView;
		concurrently?: boolean;
		withNoData?: boolean;
	};

	constructor(
		view: PgMaterializedView,
		private session: PgSession,
		private dialect: PgDialect,
	) {
		super();
		this.config = { view };
	}

	concurrently(): this {
		if (this.config.withNoData !== undefined) {
			throw new Error('Cannot use concurrently and withNoData together');
		}
		this.config.concurrently = true;
		return this;
	}

	withNoData(): this {
		if (this.config.concurrently !== undefined) {
			throw new Error('Cannot use concurrently and withNoData together');
		}
		this.config.withNoData = true;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildRefreshMaterializedViewQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(name?: string): PgPreparedQuery<
		PreparedQueryConfig & {
			execute: QueryResultKind<TQueryResult, never>;
		}
	> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery(this.dialect.sqlToQuery(this.getSQL()), undefined, name, true);
		});
	}

	prepare(name: string): PgPreparedQuery<
		PreparedQueryConfig & {
			execute: QueryResultKind<TQueryResult, never>;
		}
	> {
		return this._prepare(name);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};
}
