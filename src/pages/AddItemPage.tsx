import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays } from 'date-fns'
import { 
  Plus, Clock, Zap, ArrowLeft, Sparkles, Brain,
  ShoppingCart, Utensils, Dumbbell, CheckSquare, DollarSign, Flame
} from 'lucide-react'
import { taskService } from '../services/api'
import AITextAnalyzer from '../components/AITextAnalyzer'
import VoiceInput from '../components/VoiceInput'
import ProjectSelector from '../components/ProjectSelector'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'

const categories = [
  { value: 'health', label: 'Health', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'work', label: 'Work', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'personal', label: 'Personal', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'fitness', label: 'Fitness', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { value: 'grocery', label: 'Grocery', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { value: 'nutrition', label: 'Nutrition', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
]

const itemTypes = [
  { value: 'task', label: 'Task', icon: CheckSquare, description: 'One-time tasks and reminders' },
  { value: 'habit', label: 'Habit', icon: Zap, description: 'Daily recurring activities' },
  { value: 'grocery', label: 'Grocery', icon: ShoppingCart, description: 'Shopping list items' },
  { value: 'meal', label: 'Meal', icon: Utensils, description: 'Meals and nutrition tracking' },
  { value: 'workout', label: 'Workout', icon: Dumbbell, description: 'Exercise and fitness activities' },
]

export default function AddItemPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  // Form state
  const [itemType, setItemType] = useState<'task' | 'habit' | 'grocery' | 'meal' | 'workout'>('task')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('personal')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState(30)
  const [scheduledDate, setScheduledDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [inputMode, setInputMode] = useState<'form' | 'ai' | 'voice'>('form')
  const [projectId, setProjectId] = useState<string | undefined>()
  
  // Grocery-specific state
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [groceryCategory, setGroceryCategory] = useState<'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'other'>('other')
  const [store] = useState('')
  
  // Meal-specific state
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [ingredients, setIngredients] = useState<Array<{ name: string; amount: string }>>([{ name: '', amount: '' }])
  const [instructions] = useState('')
  
  // Workout-specific state
  const [workoutType, setWorkoutType] = useState<'strength' | 'cardio' | 'flexibility' | 'sports'>('strength')
  const [intensity, setIntensity] = useState<'low' | 'medium' | 'high'>('medium')
  const [exercises, setExercises] = useState<Array<{
    name: string; sets?: number; reps?: number; weight?: number; duration?: number
  }>>([{ name: '', sets: 3, reps: 10 }])
  
     const addItemMutation = useMutation({
     mutationFn: taskService.addTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} added successfully!`)
      navigate('/')
    },
    onError: () => {
      toast.error(`Failed to add ${itemType}`)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }

    const baseData = {
      title: title.trim(),
      type: itemType,
      category,
      startTime: startTime || null,
      duration,
      repeat: itemType === 'habit' ? 'daily' : 'none',
      scheduledDate,
      projectId
    }

    let taskData: any = baseData

    // Add type-specific data
    switch (itemType) {
      case 'grocery':
        taskData.groceryInfo = {
          quantity: quantity || undefined,
          price: price ? parseFloat(price) : undefined,
          groceryCategory,
          store: store || undefined,
        }
        break
      
      case 'meal':
        taskData.mealInfo = {
          mealType,
          calories: calories ? parseInt(calories) : undefined,
          protein: protein ? parseInt(protein) : undefined,
          carbs: carbs ? parseInt(carbs) : undefined,
          fat: fat ? parseInt(fat) : undefined,
          ingredients: ingredients.filter(ing => ing.name.trim()),
          instructions: instructions || undefined,
        }
        break
      
      case 'workout':
        taskData.workoutInfo = {
          workoutType,
          intensity,
          exercises: exercises.filter(ex => ex.name.trim()),
        }
        break
    }

    addItemMutation.mutate(taskData)
  }

  const handleVoiceTranscript = (transcript: string) => {
    setTitle(transcript)
  }

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '' }])
  }

  const updateIngredient = (index: number, field: 'name' | 'amount', value: string) => {
    const updated = [...ingredients]
    updated[index][field] = value
    setIngredients(updated)
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const addExercise = () => {
    setExercises([...exercises, { name: '', sets: 3, reps: 10 }])
  }

  const updateExercise = (index: number, field: string, value: any) => {
    const updated = [...exercises]
    updated[index] = { ...updated[index], [field]: value }
    setExercises(updated)
  }

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index))
  }

  const quickDates = [
    { label: 'Today', value: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', value: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: 'This Weekend', value: format(addDays(new Date(), 6 - new Date().getDay()), 'yyyy-MM-dd') },
    { label: 'Next Week', value: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
  ]

  if (inputMode === 'ai') {
    return (
      <AITextAnalyzer
        onClose={() => setInputMode('form')}
        scheduledDate={scheduledDate}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Dashboard</span>
        </button>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setInputMode('ai')}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-xl text-cyan-400 hover:bg-cyan-500/30 transition-all duration-300"
          >
            <Brain className="w-4 h-4" />
            <span>AI Assistant</span>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center animate-float">
            <Plus className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-100 neon-text">Add New Item</h1>
            <p className="text-gray-300">Create tasks, habits, grocery items, meals, or workouts</p>
          </div>
        </div>

        {/* Item Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Item Type</label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {itemTypes.map((type) => {
              const IconComponent = type.icon
              return (
                <button
                  key={type.value}
                  onClick={() => setItemType(type.value as any)}
                  className={`p-3 rounded-xl border transition-all duration-300 ${
                    itemType === type.value
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                      : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:bg-gray-800/50'
                  }`}
                >
                  <IconComponent className="w-5 h-5 mx-auto mb-1" />
                  <div className="text-xs font-medium">{type.label}</div>
                </button>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {itemType === 'grocery' ? 'Item Name' : 
               itemType === 'meal' ? 'Meal Name' :
               itemType === 'workout' ? 'Workout Name' : 'Title'}
            </label>
            <div className="relative">
              {inputMode === 'voice' ? (
                <VoiceInput
                  onTranscriptChange={handleVoiceTranscript}
                  placeholder={`Speak to add ${itemType}...`}
                />
              ) : (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field holographic"
                  placeholder={`Enter ${itemType} name...`}
                  required
                />
              )}
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setInputMode(inputMode === 'voice' ? 'form' : 'voice')}
                  className="text-gray-400 hover:text-cyan-400 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-300 ${
                    category === cat.value ? cat.color : 'border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
                     </div>

           {/* Project Selection */}
           <ProjectSelector
             selectedProjectId={projectId}
             onProjectSelect={setProjectId}
           />

           {/* Type-specific fields */}
          {itemType === 'grocery' && (
            <div className="space-y-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <h3 className="text-lg font-medium text-emerald-400 flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Grocery Details</span>
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Quantity</label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input-field"
                    placeholder="2 lbs, 1 dozen, etc."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Price</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="input-field pl-10"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Grocery Category</label>
                <select
                  value={groceryCategory}
                  onChange={(e) => setGroceryCategory(e.target.value as any)}
                  className="input-field"
                >
                  <option value="produce">Produce</option>
                  <option value="dairy">Dairy</option>
                  <option value="meat">Meat</option>
                  <option value="pantry">Pantry</option>
                  <option value="frozen">Frozen</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          )}

          {itemType === 'meal' && (
            <div className="space-y-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <h3 className="text-lg font-medium text-rose-400 flex items-center space-x-2">
                <Utensils className="w-5 h-5" />
                <span>Meal Details</span>
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Meal Type</label>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as any)}
                    className="input-field"
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Calories</label>
                  <div className="relative">
                    <Flame className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      value={calories}
                      onChange={(e) => setCalories(e.target.value)}
                      className="input-field pl-10"
                      placeholder="500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Protein (g)</label>
                  <input
                    type="number"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    className="input-field"
                    placeholder="25"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Carbs (g)</label>
                  <input
                    type="number"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    className="input-field"
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Fat (g)</label>
                  <input
                    type="number"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="input-field"
                    placeholder="15"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Ingredients</label>
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={ingredient.name}
                      onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                      className="input-field flex-1"
                      placeholder="Ingredient name"
                    />
                    <input
                      type="text"
                      value={ingredient.amount}
                      onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                      className="input-field w-24"
                      placeholder="Amount"
                    />
                    {ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeIngredient(index)}
                        className="px-3 py-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addIngredient}
                  className="text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  + Add Ingredient
                </button>
              </div>
            </div>
          )}

          {itemType === 'workout' && (
            <div className="space-y-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <h3 className="text-lg font-medium text-amber-400 flex items-center space-x-2">
                <Dumbbell className="w-5 h-5" />
                <span>Workout Details</span>
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Workout Type</label>
                  <select
                    value={workoutType}
                    onChange={(e) => setWorkoutType(e.target.value as any)}
                    className="input-field"
                  >
                    <option value="strength">Strength</option>
                    <option value="cardio">Cardio</option>
                    <option value="flexibility">Flexibility</option>
                    <option value="sports">Sports</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Intensity</label>
                  <select
                    value={intensity}
                    onChange={(e) => setIntensity(e.target.value as any)}
                    className="input-field"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Exercises</label>
                {exercises.map((exercise, index) => (
                  <div key={index} className="space-y-2 mb-4 p-3 bg-gray-800/50 rounded-lg">
                    <input
                      type="text"
                      value={exercise.name}
                      onChange={(e) => updateExercise(index, 'name', e.target.value)}
                      className="input-field w-full"
                      placeholder="Exercise name"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        value={exercise.sets || ''}
                        onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value))}
                        className="input-field"
                        placeholder="Sets"
                      />
                      <input
                        type="number"
                        value={exercise.reps || ''}
                        onChange={(e) => updateExercise(index, 'reps', parseInt(e.target.value))}
                        className="input-field"
                        placeholder="Reps"
                      />
                      <input
                        type="number"
                        value={exercise.weight || ''}
                        onChange={(e) => updateExercise(index, 'weight', parseFloat(e.target.value))}
                        className="input-field"
                        placeholder="Weight"
                      />
                    </div>
                    {exercises.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeExercise(index)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove Exercise
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addExercise}
                  className="text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  + Add Exercise
                </button>
              </div>
            </div>
          )}

          {/* Scheduling (for all types except grocery) */}
          {itemType !== 'grocery' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="input-field holographic"
                />
                <div className="flex space-x-2 mt-2">
                  {quickDates.map((quick) => (
                    <button
                      key={quick.label}
                      type="button"
                      onClick={() => setScheduledDate(quick.value)}
                      className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                    >
                      {quick.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Time (Optional)</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="input-field pl-10 holographic"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Duration (for tasks, habits, meals, workouts) */}
          {itemType !== 'grocery' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Duration (minutes)
              </label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="input-field holographic"
                min="1"
                placeholder="30"
              />
            </div>
          )}

          {/* Submit Button */}
          <motion.button
            type="submit"
            disabled={addItemMutation.isPending}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 px-6 rounded-xl font-medium hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-lg shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {addItemMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span>Add {itemType.charAt(0).toUpperCase() + itemType.slice(1)}</span>
              </>
            )}
          </motion.button>
        </form>
      </div>
    </div>
  )
}