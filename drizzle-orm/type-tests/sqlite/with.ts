import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { and, eq, gt, inArray, isNull, lt } from '~/expressions.ts';
import { sql } from '~/sql/sql.ts';
import { AnySQLiteColumn, integer, sqliteTable, text } from '~/sqlite-core/index.ts';
import { db } from './db.ts';

const orders = sqliteTable('orders', {
	id: integer('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull(),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

{
	const regionalSales = db
		.$with('regional_sales')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region),
		);

	const topRegions = db
		.$with('top_regions')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: orders.amount,
				})
				.from(regionalSales)
				.where(
					gt(
						regionalSales.totalSales,
						db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
					),
				),
		);

	const result = db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`sum(${orders.quantity})`,
			productSales: sql<number>`sum(${orders.amount})`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.all();

	Expect<
		Equal<{
			region: string;
			product: string;
			productUnits: number;
			productSales: number;
		}[], typeof result>
	>;
}

{
	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
		managerId: integer('manager_id')
			.references((): AnySQLiteColumn => users.id)
			.$default(() => 1),
		createdAt: integer('created_at', { mode: 'timestamp' }).default(
			sql`current_timestamp(3)`,
		),
	});

	const employeePath = db.$withRecursive('employeePath').as(
		db
			.select({
				id: users.id,
				name: users.name,
				path: sql`cast(${users.id} as char(60))`.mapWith(String).as('path'),
			})
			.from(users)
			.where(isNull(users.managerId))
			.union((_, empPath) =>
				db
					.select({
						id: users.id,
						name: users.name,
						path: sql<string>`concat_ws(' -> ', ${empPath.path}, ${users.id})`,
					})
					.from(empPath.as('recursive'))
					.innerJoin(users, eq(empPath.id, users.managerId))
			),
	);

	const res = await db
		.withRecursive(employeePath)
		.select()
		.from(employeePath)
		.orderBy(employeePath.id);

	Expect<
		Equal<{
			id: number;
			name: string;
			path: string;
		}[], typeof res>
	>();
}

{
	const fibonacci = db.$withRecursive('fibonacci').as((qb) =>
		qb
			.select({
				n: sql<number>`1`.as('n'),
				fibN: sql<number>`0`.as('fibN'),
				nextFibN: sql<number>`1`.as('nextFibN'),
				goldenRatio: sql<number>`cast(0 as decimal(5,4))`.as('gRatio'),
			})
			.unionAll((_, recTable) =>
				qb
					.select({
						n: sql<number>`${recTable.n} + 1`,
						fibN: recTable.nextFibN,
						nextFibN: sql<number>`${recTable.fibN} + ${recTable.nextFibN}`,
						goldenRatio: sql<
							number
						>`case when ${recTable.fibN} = 0 then 0 else ${recTable.nextFibN} / ${recTable.fibN} end`,
					})
					.from(recTable)
					.where(and(lt(recTable.n, 10)))
			)
	);

	const res1 = await db.withRecursive(fibonacci).select().from(fibonacci);

	Expect<Equal<typeof res1, { n: number; fibN: number; nextFibN: number; goldenRatio: number }[]>>();
}
