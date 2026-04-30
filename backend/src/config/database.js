import './env.js';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabaseKey) {
	throw new Error('SUPABASE_URL e uma chave (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_PUBLISHABLE_KEY) sao obrigatorias.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MODEL_TABLE = {
	user: 'User',
	trainer: 'Trainer',
	client: 'Client',
	metricDefinition: 'MetricDefinition',
	metricEntry: 'MetricEntry',
	workoutPlan: 'WorkoutPlan',
	workoutDay: 'WorkoutDay',
	exercise: 'Exercise',
	progressPhoto: 'ProgressPhoto',
	payment: 'Payment',
	clientPackage: 'ClientPackage',
	metricPreset: 'MetricPreset',
	metricPresetItem: 'MetricPresetItem',
	checkIn: 'CheckIn',
	checkInLink: 'CheckInLink',
	onlineClientLink: 'OnlineClientLink',
	feedbackLink: 'FeedbackLink',
	clientFeedback: 'ClientFeedback',
	automation: 'Automation',
};

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

function ensureId(data = {}) {
	const record = { ...data };
	if (record.id === null || record.id === undefined || record.id === '') {
		record.id = randomUUID();
	}
	return record;
}

function ensureAuditTimestamps(model, data = {}) {
	const record = { ...data };
	const modelsWithAuditTimestamps = new Set(['user', 'client', 'metricDefinition', 'payment', 'workoutPlan']);
	if (!modelsWithAuditTimestamps.has(model)) return record;

	const now = new Date().toISOString();
	if (record.createdAt === null || record.createdAt === undefined || record.createdAt === '') {
		record.createdAt = now;
	}
	if (record.updatedAt === null || record.updatedAt === undefined || record.updatedAt === '') {
		record.updatedAt = now;
	}

	return record;
}

function applySelect(record, select) {
	if (!record) return record;
	if (!select) return record;
	const selected = {};
	for (const [key, enabled] of Object.entries(select)) {
		if (enabled) selected[key] = record[key];
	}
	return selected;
}

function applyOrder(records, orderBy) {
	const rules = toArray(orderBy).filter(Boolean);
	if (!rules.length) return records;

	const list = [...records];
	list.sort((a, b) => {
		for (const rule of rules) {
			const [field, direction] = Object.entries(rule)[0] || [];
			if (!field) continue;

			const av = a[field];
			const bv = b[field];
			if (av === bv) continue;

			const asc = String(direction || 'asc').toLowerCase() === 'asc';
			if (av === null || av === undefined) return asc ? 1 : -1;
			if (bv === null || bv === undefined) return asc ? -1 : 1;

			if (av > bv) return asc ? 1 : -1;
			if (av < bv) return asc ? -1 : 1;
		}
		return 0;
	});

	return list;
}

function applyPagination(records, args = {}) {
	const skip = Number.isInteger(args.skip) ? args.skip : 0;
	const take = Number.isInteger(args.take) ? args.take : undefined;
	if (take === undefined) return skip ? records.slice(skip) : records;
	return records.slice(skip, skip + take);
}

function attachNestedWhereFilter(model, records, where) {
	if (!where) return records;

	if (model === 'client' && isPlainObject(where.user) && where.user.id) {
		return records.filter((row) => row.userId === where.user.id);
	}

	return records;
}

function buildQuery(model, where = {}) {
	const table = MODEL_TABLE[model];
	let query = supabase.from(table).select('*');

	for (const [key, value] of Object.entries(where || {})) {
		if (key === 'user' && model === 'client') continue;

		if (isPlainObject(value)) {
			if (Array.isArray(value.in)) {
				query = query.in(key, value.in);
			}
			if (value.gte !== undefined) {
				query = query.gte(key, value.gte instanceof Date ? value.gte.toISOString() : value.gte);
			}
			if (value.lte !== undefined) {
				query = query.lte(key, value.lte instanceof Date ? value.lte.toISOString() : value.lte);
			}
			if (value.gt !== undefined) {
				query = query.gt(key, value.gt instanceof Date ? value.gt.toISOString() : value.gt);
			}
			if (value.lt !== undefined) {
				query = query.lt(key, value.lt instanceof Date ? value.lt.toISOString() : value.lt);
			}
			continue;
		}

		query = query.eq(key, value);
	}

	return query;
}

async function fetchMany(model, args = {}) {
	const { data, error } = await buildQuery(model, args.where);
	if (error) throw new Error(error.message);

	const filtered = attachNestedWhereFilter(model, data || [], args.where);
	const ordered = applyOrder(filtered, args.orderBy);
	const paged = applyPagination(ordered, args);
	return paged;
}

async function fetchOne(model, args = {}) {
	const list = await fetchMany(model, { ...args, take: 1 });
	return list[0] || null;
}

async function hydrateUsers(records, include) {
	if (!include) return records;

	const needsTrainer = !!include.trainer;
	const needsClient = !!include.client;
	if (!needsTrainer && !needsClient) return records;

	const userIds = records.map((row) => row.id).filter(Boolean);
	if (!userIds.length) return records;

	const [trainerRows, clientRows] = await Promise.all([
		needsTrainer
			? fetchMany('trainer', { where: { userId: { in: userIds } } })
			: Promise.resolve([]),
		needsClient
			? fetchMany('client', { where: { userId: { in: userIds } } })
			: Promise.resolve([]),
	]);

	const trainerByUserId = new Map(trainerRows.map((row) => [row.userId, row]));
	const clientByUserId = new Map(clientRows.map((row) => [row.userId, row]));

	return records.map((row) => ({
		...row,
		...(needsTrainer ? { trainer: trainerByUserId.get(row.id) || null } : {}),
		...(needsClient ? { client: clientByUserId.get(row.id) || null } : {}),
	}));
}

async function hydrateClients(records, include) {
	if (!include) return records;
	const clientIds = records.map((row) => row.id).filter(Boolean);
	if (!clientIds.length) return records;

	let usersById = new Map();
	if (include.user) {
		const userIds = records.map((row) => row.userId).filter(Boolean);
		const users = userIds.length
			? await fetchMany('user', { where: { id: { in: userIds } } })
			: [];
		usersById = new Map(users.map((row) => [row.id, row]));
	}

	let paymentsByClientId = new Map();
	if (include.payments) {
		const paymentWhere = isPlainObject(include.payments.where) ? include.payments.where : {};
		const payments = await fetchMany('payment', {
			where: { clientId: { in: clientIds }, ...paymentWhere },
			orderBy: include.payments.orderBy,
			take: include.payments.take,
		});
		for (const payment of payments) {
			const bucket = paymentsByClientId.get(payment.clientId) || [];
			bucket.push(payment);
			paymentsByClientId.set(payment.clientId, bucket);
		}
	}

	let packagesById = new Map();
	if (include.package) {
		const packageIds = [...new Set(records.map((row) => row.packageId).filter(Boolean))];
		const packageRows = packageIds.length
			? await fetchMany('clientPackage', { where: { id: { in: packageIds } } })
			: [];
		packagesById = new Map(packageRows.map((row) => [row.id, row]));
	}

	return records.map((row) => ({
		...row,
		...(include.user
			? {
					user: include.user.select
						? applySelect(usersById.get(row.userId) || null, include.user.select)
						: (usersById.get(row.userId) || null),
				}
			: {}),
		...(include.package
			? {
					package: include.package.select
						? applySelect(packagesById.get(row.packageId) || null, include.package.select)
						: (packagesById.get(row.packageId) || null),
				}
			: {}),
		...(include.payments ? { payments: paymentsByClientId.get(row.id) || [] } : {}),
	}));
}

async function hydrateMetricEntries(records, include) {
	if (!include?.metricDefinition) return records;

	const definitionIds = [...new Set(records.map((row) => row.metricDefinitionId).filter(Boolean))];
	const definitions = definitionIds.length
		? await fetchMany('metricDefinition', { where: { id: { in: definitionIds } } })
		: [];
	const definitionById = new Map(definitions.map((row) => [row.id, row]));

	return records.map((row) => ({
		...row,
		metricDefinition: include.metricDefinition.select
			? applySelect(definitionById.get(row.metricDefinitionId) || null, include.metricDefinition.select)
			: (definitionById.get(row.metricDefinitionId) || null),
	}));
}

async function hydrateMetricPresets(records, include) {
	if (!include) return records;
	const presetIds = records.map((row) => row.id).filter(Boolean);
	if (!presetIds.length) return records;

	let itemsByPresetId = new Map();
	if (include.items || include._count) {
		const itemRows = await fetchMany('metricPresetItem', {
			where: { presetId: { in: presetIds } },
			orderBy: include.items?.orderBy,
		});
		for (const item of itemRows) {
			const bucket = itemsByPresetId.get(item.presetId) || [];
			bucket.push(item);
			itemsByPresetId.set(item.presetId, bucket);
		}
	}

	return records.map((row) => ({
		...row,
		...(include.items ? { items: itemsByPresetId.get(row.id) || [] } : {}),
		...(include._count?.select?.items ? { _count: { items: (itemsByPresetId.get(row.id) || []).length } } : {}),
	}));
}

async function hydrateWorkoutPlans(records, include) {
	if (!include?.days) return records;

	const planIds = records.map((row) => row.id).filter(Boolean);
	if (!planIds.length) return records;

	const days = await fetchMany('workoutDay', {
		where: { workoutPlanId: { in: planIds } },
		orderBy: include.days.orderBy,
	});

	const dayIds = days.map((row) => row.id).filter(Boolean);
	const exercises = include.days.include?.exercises
		? await fetchMany('exercise', {
				where: { workoutDayId: { in: dayIds } },
				orderBy: include.days.include.exercises.orderBy,
			})
		: [];

	const exercisesByDayId = new Map();
	for (const exercise of exercises) {
		const bucket = exercisesByDayId.get(exercise.workoutDayId) || [];
		bucket.push(exercise);
		exercisesByDayId.set(exercise.workoutDayId, bucket);
	}

	const daysByPlanId = new Map();
	for (const day of days) {
		const fullDay = {
			...day,
			...(include.days.include?.exercises ? { exercises: exercisesByDayId.get(day.id) || [] } : {}),
		};
		const bucket = daysByPlanId.get(day.workoutPlanId) || [];
		bucket.push(fullDay);
		daysByPlanId.set(day.workoutPlanId, bucket);
	}

	return records.map((row) => ({
		...row,
		days: daysByPlanId.get(row.id) || [],
	}));
}

async function hydrate(model, records, include) {
	if (!include) return records;
	if (!Array.isArray(records) || !records.length) return records;

	if (model === 'user') return hydrateUsers(records, include);
	if (model === 'client') return hydrateClients(records, include);
	if (model === 'metricEntry') return hydrateMetricEntries(records, include);
	if (model === 'metricPreset') return hydrateMetricPresets(records, include);
	if (model === 'workoutPlan') return hydrateWorkoutPlans(records, include);

	return records;
}

async function modelFindMany(model, args = {}) {
	const rows = await fetchMany(model, args);
	const hydrated = await hydrate(model, rows, args.include);
	if (args.select) return hydrated.map((row) => applySelect(row, args.select));
	return hydrated;
}

async function modelFindUnique(model, args = {}) {
	const row = await fetchOne(model, args);
	if (!row) return null;
	const hydrated = await hydrate(model, [row], args.include);
	const result = hydrated[0] || null;
	return args.select ? applySelect(result, args.select) : result;
}

async function modelCreate(model, args = {}) {
	const table = MODEL_TABLE[model];
	const data = ensureAuditTimestamps(model, ensureId(args.data || {}));

	if (model === 'workoutPlan' && isPlainObject(data.days) && Array.isArray(data.days.create)) {
		const dayRows = data.days.create;
		delete data.days;

		const { data: planRow, error: planError } = await supabase.from(table).insert([data]).select('*').single();
		if (planError) throw new Error(planError.message);

		for (const day of dayRows) {
			const dayData = ensureId({ ...day, workoutPlanId: planRow.id });
			const exerciseRows = isPlainObject(dayData.exercises) && Array.isArray(dayData.exercises.create)
				? dayData.exercises.create
				: [];
			delete dayData.exercises;

			const { data: createdDay, error: dayError } = await supabase
				.from(MODEL_TABLE.workoutDay)
				.insert([dayData])
				.select('*')
				.single();
			if (dayError) throw new Error(dayError.message);

			if (exerciseRows.length) {
				const payload = exerciseRows.map((exercise) => ensureId({ ...exercise, workoutDayId: createdDay.id }));
				const { error: exerciseError } = await supabase.from(MODEL_TABLE.exercise).insert(payload);
				if (exerciseError) throw new Error(exerciseError.message);
			}
		}

		if (args.include) {
			return modelFindUnique(model, {
				where: { id: planRow.id },
				include: args.include,
			});
		}

		return planRow;
	}

	const { data: created, error } = await supabase.from(table).insert([data]).select('*').single();
	if (error) throw new Error(error.message);
	return created;
}

async function modelUpdate(model, args = {}) {
	const table = MODEL_TABLE[model];
	const existing = await modelFindUnique(model, { where: args.where });
	if (!existing) throw new Error('Registro nao encontrado para update.');

	const { data: updated, error } = await supabase
		.from(table)
		.update(args.data || {})
		.eq('id', existing.id)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return updated;
}

async function modelDelete(model, args = {}) {
	const table = MODEL_TABLE[model];
	const existing = await modelFindUnique(model, { where: args.where });
	if (!existing) return null;

	const { data: deleted, error } = await supabase
		.from(table)
		.delete()
		.eq('id', existing.id)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return deleted;
}

async function modelDeleteMany(model, args = {}) {
	const table = MODEL_TABLE[model];
	const rows = await modelFindMany(model, { where: args.where });
	for (const row of rows) {
		const { error } = await supabase.from(table).delete().eq('id', row.id);
		if (error) throw new Error(error.message);
	}
	return { count: rows.length };
}

async function modelUpdateMany(model, args = {}) {
	const table = MODEL_TABLE[model];
	const rows = await modelFindMany(model, { where: args.where });
	for (const row of rows) {
		const { error } = await supabase.from(table).update(args.data || {}).eq('id', row.id);
		if (error) throw new Error(error.message);
	}
	return { count: rows.length };
}

async function modelCreateMany(model, args = {}) {
	const table = MODEL_TABLE[model];
	const payload = Array.isArray(args.data)
		? args.data.map((row) => ensureAuditTimestamps(model, ensureId(row || {})))
		: [];
	if (!payload.length) return { count: 0 };
	const { error } = await supabase.from(table).insert(payload);
	if (error) throw new Error(error.message);
	return { count: payload.length };
}

function normalizeUpsertWhere(where = {}) {
	const entries = Object.entries(where || {});
	if (entries.length !== 1) return where;
	const [key, value] = entries[0];
	if (!isPlainObject(value)) return where;
	if (key.includes('_')) return value;
	return where;
}

async function modelUpsert(model, args = {}) {
	const normalizedWhere = normalizeUpsertWhere(args.where || {});
	const existing = await modelFindUnique(model, { where: normalizedWhere });
	if (existing) {
		return modelUpdate(model, { where: { id: existing.id }, data: args.update || {} });
	}
	return modelCreate(model, { data: args.create || {} });
}

function createModelDelegate(model) {
	return {
		findUnique: (args) => modelFindUnique(model, args),
		findFirst: (args) => modelFindUnique(model, args),
		findMany: (args) => modelFindMany(model, args),
		create: (args) => modelCreate(model, args),
		createMany: (args) => modelCreateMany(model, args),
		update: (args) => modelUpdate(model, args),
		upsert: (args) => modelUpsert(model, args),
		updateMany: (args) => modelUpdateMany(model, args),
		delete: (args) => modelDelete(model, args),
		deleteMany: (args) => modelDeleteMany(model, args),
	};
}

const prisma = {
	user: createModelDelegate('user'),
	trainer: createModelDelegate('trainer'),
	client: createModelDelegate('client'),
	metricDefinition: createModelDelegate('metricDefinition'),
	metricEntry: createModelDelegate('metricEntry'),
	workoutPlan: createModelDelegate('workoutPlan'),
	workoutDay: createModelDelegate('workoutDay'),
	exercise: createModelDelegate('exercise'),
	progressPhoto: createModelDelegate('progressPhoto'),
	payment: createModelDelegate('payment'),
	clientPackage: createModelDelegate('clientPackage'),
	metricPreset: createModelDelegate('metricPreset'),
	metricPresetItem: createModelDelegate('metricPresetItem'),
	checkIn: createModelDelegate('checkIn'),
	checkInLink: createModelDelegate('checkInLink'),
	onlineClientLink: createModelDelegate('onlineClientLink'),
	feedbackLink: createModelDelegate('feedbackLink'),
	clientFeedback: createModelDelegate('clientFeedback'),
	automation: createModelDelegate('automation'),
	$transaction: async (callback) => callback(prisma),
};

export { supabase, prisma };
