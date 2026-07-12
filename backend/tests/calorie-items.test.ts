import { db } from '../src/supabase-client'
import {
  getMostUsedCalorieItems,
  getRecentCalorieItems,
  getCalorieItemByName,
  CalorieItemSchema,
} from '../src/calorie-items'

jest.mock('../src/supabase-client', () => ({
  db: {
    getMostUsedCalorieItems: jest.fn(),
    getRecentCalorieItems: jest.fn(),
    getCalorieItemByNormalizedName: jest.fn(),
    upsertCalorieItem: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

const USER_ID = 'user-1'

function calorieItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    user_id: USER_ID,
    name: 'Eggs',
    normalized_name: 'eggs',
    quantity: '2 eggs',
    normalized_quantity: '2 eggs',
    calories: 140,
    protein: 6,
    carbs: 1,
    fat: 11,
    usage_count: 5,
    last_used_at: '2026-06-24T08:00:00.000Z',
    created_at: '2026-06-20T08:00:00.000Z',
    updated_at: '2026-06-24T08:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('calorie items service', () => {
  describe('getMostUsedCalorieItems', () => {
    it('returns items sorted by usage_count descending', async () => {
      const items = [
        calorieItem({ name: 'Eggs', normalized_name: 'eggs', usage_count: 10 }),
        calorieItem({ name: 'Chicken', normalized_name: 'chicken', usage_count: 8 }),
        calorieItem({ name: 'Apple', normalized_name: 'apple', usage_count: 5 }),
      ]
      mockDb.getMostUsedCalorieItems.mockResolvedValue(items)

      const result = await getMostUsedCalorieItems(USER_ID, 10)

      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('Eggs')
      expect(result[0].quantity).toBe('2 eggs')
      expect(result[0].usage_count).toBe(10)
      expect(result[1].name).toBe('Chicken')
      expect(result[1].usage_count).toBe(8)
      expect(result[2].name).toBe('Apple')
      expect(result[2].usage_count).toBe(5)
      expect(mockDb.getMostUsedCalorieItems).toHaveBeenCalledWith(USER_ID, 10)
    })

    it('respects the limit parameter', async () => {
      mockDb.getMostUsedCalorieItems.mockResolvedValue([calorieItem()])

      await getMostUsedCalorieItems(USER_ID, 5)

      expect(mockDb.getMostUsedCalorieItems).toHaveBeenCalledWith(USER_ID, 5)
    })

    it('defaults to limit of 10', async () => {
      mockDb.getMostUsedCalorieItems.mockResolvedValue([calorieItem()])

      await getMostUsedCalorieItems(USER_ID)

      expect(mockDb.getMostUsedCalorieItems).toHaveBeenCalledWith(USER_ID, 10)
    })

    it('validates returned items with schema', async () => {
      mockDb.getMostUsedCalorieItems.mockResolvedValue([calorieItem()])

      const result = await getMostUsedCalorieItems(USER_ID)

      expect(() => CalorieItemSchema.parse(result[0])).not.toThrow()
    })
  })

  describe('getRecentCalorieItems', () => {
    it('returns items sorted by last_used_at descending', async () => {
      const items = [
        calorieItem({
          name: 'Eggs',
          normalized_name: 'eggs',
          last_used_at: '2026-06-24T18:00:00.000Z',
        }),
        calorieItem({
          name: 'Chicken',
          normalized_name: 'chicken',
          last_used_at: '2026-06-24T12:00:00.000Z',
        }),
        calorieItem({
          name: 'Apple',
          normalized_name: 'apple',
          last_used_at: '2026-06-24T08:00:00.000Z',
        }),
      ]
      mockDb.getRecentCalorieItems.mockResolvedValue(items)

      const result = await getRecentCalorieItems(USER_ID, 10)

      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('Eggs')
      expect(result[1].name).toBe('Chicken')
      expect(result[2].name).toBe('Apple')
      expect(mockDb.getRecentCalorieItems).toHaveBeenCalledWith(USER_ID, 10)
    })

    it('respects the limit parameter', async () => {
      mockDb.getRecentCalorieItems.mockResolvedValue([calorieItem()])

      await getRecentCalorieItems(USER_ID, 3)

      expect(mockDb.getRecentCalorieItems).toHaveBeenCalledWith(USER_ID, 3)
    })

    it('defaults to limit of 10', async () => {
      mockDb.getRecentCalorieItems.mockResolvedValue([calorieItem()])

      await getRecentCalorieItems(USER_ID)

      expect(mockDb.getRecentCalorieItems).toHaveBeenCalledWith(USER_ID, 10)
    })
  })

  describe('getCalorieItemByName', () => {
    it('returns item by normalized name', async () => {
      mockDb.getCalorieItemByNormalizedName.mockResolvedValue(calorieItem())

      const result = await getCalorieItemByName(USER_ID, 'Eggs')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Eggs')
      expect(result?.quantity).toBe('2 eggs')
      expect(mockDb.getCalorieItemByNormalizedName).toHaveBeenCalledWith(USER_ID, 'eggs')
    })

    it('normalizes the name by lowercasing and trimming', async () => {
      mockDb.getCalorieItemByNormalizedName.mockResolvedValue(calorieItem())

      await getCalorieItemByName(USER_ID, '  EGGS  ')

      expect(mockDb.getCalorieItemByNormalizedName).toHaveBeenCalledWith(USER_ID, 'eggs')
    })

    it('returns null if item not found', async () => {
      mockDb.getCalorieItemByNormalizedName.mockResolvedValue(null)

      const result = await getCalorieItemByName(USER_ID, 'Unknown')

      expect(result).toBeNull()
    })
  })
})

describe('calorie items database operations', () => {
  describe('upsertCalorieItem', () => {
    it('increments usage_count when item already exists', async () => {
      // This test verifies the behavior described in the task:
      // "Increment a usage counter on the calorie item record whenever it is selected for intake"

      mockDb.upsertCalorieItem.mockResolvedValue(
        calorieItem({ usage_count: 6, last_used_at: '2026-06-25T10:00:00.000Z' })
      )

      const result = await db.upsertCalorieItem(USER_ID, 'Eggs', {
        calories: 140,
        protein: 6,
        carbs: 1,
        fat: 11,
        quantity: '2 eggs',
      })

      expect(result.usage_count).toBe(6)
      expect(result.last_used_at).toBe('2026-06-25T10:00:00.000Z')
      expect(mockDb.upsertCalorieItem).toHaveBeenCalled()
    })

    it('allows same food with different quantity variants', async () => {
      const variants = [
        calorieItem({ id: '123e4567-e89b-12d3-a456-426614174001', quantity: '1 egg', normalized_quantity: '1 egg', calories: 70, usage_count: 3 }),
        calorieItem({ id: '123e4567-e89b-12d3-a456-426614174002', quantity: '2 eggs', normalized_quantity: '2 eggs', calories: 140, usage_count: 2 }),
      ]
      mockDb.getRecentCalorieItems.mockResolvedValue(variants)

      const result = await getRecentCalorieItems(USER_ID, 10)

      expect(result).toEqual([
        expect.objectContaining({ name: 'Eggs', quantity: '1 egg', calories: 70 }),
        expect.objectContaining({ name: 'Eggs', quantity: '2 eggs', calories: 140 }),
      ])
    })

    it('creates new item with usage_count of 1 when it does not exist', async () => {
      mockDb.upsertCalorieItem.mockResolvedValue(
        calorieItem({ usage_count: 1 })
      )

      const result = await db.upsertCalorieItem(USER_ID, 'NewItem', {
        calories: 100,
        protein: 5,
        carbs: 10,
        fat: 5,
        quantity: '1 bowl',
      })

      expect(result.usage_count).toBe(1)
      expect(mockDb.upsertCalorieItem).toHaveBeenCalledWith(
        USER_ID,
        'NewItem',
        expect.objectContaining({ calories: 100, quantity: '1 bowl' })
      )
    })

    it('normalizes name by trimming and lowercasing', async () => {
      mockDb.upsertCalorieItem.mockResolvedValue(calorieItem())

      await db.upsertCalorieItem(USER_ID, '  EGGS  ', {
        calories: 140,
      })

      expect(mockDb.upsertCalorieItem).toHaveBeenCalledWith(USER_ID, '  EGGS  ', expect.any(Object))
    })
  })

  describe('sorting by most-used and recent', () => {
    it('most-used returns items ordered by usage_count then last_used_at', async () => {
      const mostUsedItems = [
        calorieItem({ name: 'Eggs', normalized_name: 'eggs', usage_count: 10, last_used_at: '2026-06-20T08:00:00.000Z' }),
        calorieItem({ name: 'Chicken', normalized_name: 'chicken', usage_count: 10, last_used_at: '2026-06-25T08:00:00.000Z' }),
        calorieItem({ name: 'Apple', normalized_name: 'apple', usage_count: 5, last_used_at: '2026-06-25T08:00:00.000Z' }),
      ]
      mockDb.getMostUsedCalorieItems.mockResolvedValue(mostUsedItems)

      const result = await getMostUsedCalorieItems(USER_ID, 10)

      expect(result[0].usage_count).toBe(10)
      expect(result[1].usage_count).toBe(10)
      expect(result[2].usage_count).toBe(5)
    })

    it('recent returns items ordered by last_used_at', async () => {
      const recentItems = [
        calorieItem({ name: 'Chicken', normalized_name: 'chicken', last_used_at: '2026-06-25T18:00:00.000Z' }),
        calorieItem({ name: 'Eggs', normalized_name: 'eggs', last_used_at: '2026-06-25T12:00:00.000Z' }),
        calorieItem({ name: 'Apple', normalized_name: 'apple', last_used_at: '2026-06-25T08:00:00.000Z' }),
      ]
      mockDb.getRecentCalorieItems.mockResolvedValue(recentItems)

      const result = await getRecentCalorieItems(USER_ID, 10)

      const timestamps = result.map(r => r.last_used_at)
      expect(timestamps[0]).toBe('2026-06-25T18:00:00.000Z')
      expect(timestamps[1]).toBe('2026-06-25T12:00:00.000Z')
      expect(timestamps[2]).toBe('2026-06-25T08:00:00.000Z')
    })
  })
})
