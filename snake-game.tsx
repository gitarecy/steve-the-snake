"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Play, RotateCcw, Pause, HelpCircle, Settings } from "lucide-react"
import PWAInstall from "@/components/pwa-install"
import PWARegister from "@/components/pwa-register"

const GRID_SIZE = 25
const INITIAL_SNAKE = [{ x: 12, y: 12 }]
const INITIAL_FOOD = { x: 18, y: 18 }
const INITIAL_DIRECTION = { x: 0, y: -1 }

// Difficulty levels
const DIFFICULTY_LEVELS = {
  1: { name: "Steve the Snake", subtitle: "Easy", speed: 200 },
  2: { name: "Ssssamantha", subtitle: "Medium", speed: 200 },
  3: { name: "Simon Sssays", subtitle: "Hard", speed: 200 },
}

export default function SnakeGame() {
  const [snake, setSnake] = useState(INITIAL_SNAKE)
  const [food, setFood] = useState(INITIAL_FOOD)
  const [direction, setDirection] = useState(INITIAL_DIRECTION)
  const [gameRunning, setGameRunning] = useState(false)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [difficulty, setDifficulty] = useState(1)
  const [showDifficultySelect, setShowDifficultySelect] = useState(false)
  const [isAccelerating, setIsAccelerating] = useState(false)
  const [announceText, setAnnounceText] = useState("")
  const [lastScoreChange, setLastScoreChange] = useState(false)
  const [focusedButton, setFocusedButton] = useState<string | null>(null)

  // Session-based high scores for each difficulty level
  const [sessionHighScores, setSessionHighScores] = useState<{ [key: number]: number }>({
    1: 0, // Easy
    2: 0, // Medium
    3: 0, // Hard
  })
  const [isNewRecord, setIsNewRecord] = useState(false)
  const [showRecordCelebration, setShowRecordCelebration] = useState(false)

  // Track the actual direction used in the last move to prevent U-turns
  const lastMoveDirection = useRef(INITIAL_DIRECTION)
  const inputQueue = useRef<{ x: number; y: number }[]>([])
  const accelerationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const baseSpeedRef = useRef(DIFFICULTY_LEVELS[difficulty as keyof typeof DIFFICULTY_LEVELS].speed)

  const gameContainerRef = useRef<HTMLDivElement>(null)

  // Get current difficulty's high score
  const currentHighScore = sessionHighScores[difficulty] || 0

  // Generate obstacles based on difficulty level
  const getObstacles = useCallback(() => {
    const obstacles = new Set<string>()

    if (difficulty >= 2) {
      // Corner obstacles for medium and hard
      // Top-left corner
      for (let x = 1; x <= 3; x++) {
        for (let y = 1; y <= 3; y++) {
          if (x <= 2 || y <= 2) obstacles.add(`${x},${y}`)
        }
      }

      // Top-right corner
      for (let x = GRID_SIZE - 4; x < GRID_SIZE - 1; x++) {
        for (let y = 1; y <= 3; y++) {
          if (x >= GRID_SIZE - 3 || y <= 2) obstacles.add(`${x},${y}`)
        }
      }

      // Bottom-left corner
      for (let x = 1; x <= 3; x++) {
        for (let y = GRID_SIZE - 4; y < GRID_SIZE - 1; y++) {
          if (x <= 2 || y >= GRID_SIZE - 3) obstacles.add(`${x},${y}`)
        }
      }

      // Bottom-right corner
      for (let x = GRID_SIZE - 4; x < GRID_SIZE - 1; x++) {
        for (let y = GRID_SIZE - 4; y < GRID_SIZE - 1; y++) {
          if (x >= GRID_SIZE - 3 || y >= GRID_SIZE - 3) obstacles.add(`${x},${y}`)
        }
      }
    }

    if (difficulty >= 3) {
      // Central obstacle for hard
      const center = Math.floor(GRID_SIZE / 2)
      for (let x = center - 2; x <= center + 2; x++) {
        obstacles.add(`${x},${center}`)
      }
    }

    return obstacles
  }, [difficulty])

  const obstacles = getObstacles()

  const generateFood = useCallback(() => {
    let newFood
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      }
    } while (
      snake.some((segment) => segment.x === newFood.x && segment.y === newFood.y) ||
      obstacles.has(`${newFood.x},${newFood.y}`)
    )
    return newFood
  }, [snake, obstacles])

  const resetGame = () => {
    setSnake(INITIAL_SNAKE)
    setFood(INITIAL_FOOD)
    setDirection(INITIAL_DIRECTION)
    lastMoveDirection.current = INITIAL_DIRECTION
    inputQueue.current = []
    setScore(0)
    setIsNewRecord(false)
    setShowRecordCelebration(false)
    setGameOver(false)
    setGameRunning(false)
    setIsAccelerating(false)
    if (accelerationTimeoutRef.current) {
      clearTimeout(accelerationTimeoutRef.current)
    }
  }

  const startGame = () => {
    if (gameOver) {
      resetGame()
    }
    setGameRunning(!gameRunning)
  }

  const isValidDirection = (newDir: { x: number; y: number }, currentDir: { x: number; y: number }) => {
    // Prevent direct opposite direction (U-turn) and same direction spam
    return (
      !(newDir.x === -currentDir.x && newDir.y === -currentDir.y) &&
      !(newDir.x === currentDir.x && newDir.y === currentDir.y)
    )
  }

  const queueDirection = (newDirection: { x: number; y: number }, checkAcceleration = false) => {
    if (!gameRunning && !gameOver) {
      setGameRunning(true)
    }

    if (gameOver) return

    // Check if this is the same direction as current movement for acceleration
    const currentDir = direction
    const isSameDirection = newDirection.x === currentDir.x && newDirection.y === currentDir.y

    if (isSameDirection && checkAcceleration && gameRunning) {
      // Check if snake is moving toward a wall with no obstacles or food in the path
      const head = snake[0]
      let pathClear = true

      // Look ahead in the current direction until we hit a wall
      let checkX = head.x + newDirection.x
      let checkY = head.y + newDirection.y

      // Check each position until we reach a wall
      while (checkX >= 0 && checkX < GRID_SIZE && checkY >= 0 && checkY < GRID_SIZE) {
        // Check for obstacles or food in the path
        if (obstacles.has(`${checkX},${checkY}`) || (food.x === checkX && food.y === checkY)) {
          pathClear = false
          break
        }

        checkX += newDirection.x
        checkY += newDirection.y
      }

      // Only accelerate if path to wall is clear
      if (pathClear) {
        setIsAccelerating(true)

        // Clear acceleration after a short time to prevent permanent acceleration
        if (accelerationTimeoutRef.current) {
          clearTimeout(accelerationTimeoutRef.current)
        }
        accelerationTimeoutRef.current = setTimeout(() => {
          setIsAccelerating(false)
        }, 300) // 300ms acceleration burst

        return
      }
    }

    // Stop acceleration if changing direction
    if (!isSameDirection) {
      setIsAccelerating(false)
      if (accelerationTimeoutRef.current) {
        clearTimeout(accelerationTimeoutRef.current)
      }
    }

    // Only queue if it's a valid direction change
    const lastDirection =
      inputQueue.current.length > 0 ? inputQueue.current[inputQueue.current.length - 1] : lastMoveDirection.current

    if (isValidDirection(newDirection, lastDirection)) {
      // Clear queue and add new direction (only keep the most recent input)
      inputQueue.current = [newDirection]
    }
  }

  const moveSnake = useCallback(() => {
    if (!gameRunning || gameOver) return

    setSnake((currentSnake) => {
      // Get next direction from queue or use current direction
      let nextDirection = direction
      if (inputQueue.current.length > 0) {
        const queuedDirection = inputQueue.current.shift()!
        if (isValidDirection(queuedDirection, lastMoveDirection.current)) {
          nextDirection = queuedDirection
          setDirection(nextDirection)
        }
      }

      // Update the last move direction
      lastMoveDirection.current = nextDirection

      const newSnake = [...currentSnake]
      const head = { ...newSnake[0] }

      head.x += nextDirection.x
      head.y += nextDirection.y

      // Wrap around walls (like original Snake game)
      if (head.x < 0) {
        head.x = GRID_SIZE - 1
      } else if (head.x >= GRID_SIZE) {
        head.x = 0
      }

      if (head.y < 0) {
        head.y = GRID_SIZE - 1
      } else if (head.y >= GRID_SIZE) {
        head.y = 0
      }

      // Check obstacle collision
      if (obstacles.has(`${head.x},${head.y}`)) {
        setGameOver(true)
        setGameRunning(false)
        return currentSnake
      }

      // Check self collision
      if (newSnake.some((segment) => segment.x === head.x && segment.y === head.y)) {
        setGameOver(true)
        setGameRunning(false)
        return currentSnake
      }

      newSnake.unshift(head)

      // Check food collision
      if (head.x === food.x && head.y === food.y) {
        const newScore = score + 10
        setScore(newScore)

        // Check for new session high score for current difficulty
        const currentDifficultyHighScore = sessionHighScores[difficulty] || 0
        if (newScore > currentDifficultyHighScore) {
          // Update session high score for this difficulty
          setSessionHighScores((prev) => ({
            ...prev,
            [difficulty]: newScore,
          }))
          setIsNewRecord(true)

          // Add haptic feedback for new record
          if ("vibrate" in navigator) {
            navigator.vibrate([100, 50, 100, 50, 200])
          }
        }

        setFood(generateFood())
        setLastScoreChange(true)
      } else {
        newSnake.pop()
      }

      return newSnake
    })
  }, [direction, food, gameRunning, gameOver, generateFood, obstacles, score, sessionHighScores, difficulty])

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault() // Prevent scrolling
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    if (!touchStart) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStart.x
    const deltaY = touch.clientY - touchStart.y
    const minSwipeDistance = 30 // Reduced for better responsiveness

    if (Math.abs(deltaX) < minSwipeDistance && Math.abs(deltaY) < minSwipeDistance) {
      return
    }

    // Add haptic feedback for mobile
    if ("vibrate" in navigator) {
      navigator.vibrate(50)
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe
      if (deltaX > 0) {
        queueDirection({ x: 1, y: 0 }) // Right
      } else {
        queueDirection({ x: -1, y: 0 }) // Left
      }
    } else {
      // Vertical swipe
      if (deltaY > 0) {
        queueDirection({ x: 0, y: 1 }) // Down
      } else {
        queueDirection({ x: 0, y: -1 }) // Up
      }
    }

    setTouchStart(null)
  }

  const handleDirectionClick = (newDirection: { x: number; y: number }) => {
    // Add haptic feedback for mobile
    if ("vibrate" in navigator) {
      navigator.vibrate(30)
    }
    queueDirection(newDirection)
  }

  const handleDifficultyChange = (newDifficulty: number) => {
    setDifficulty(newDifficulty)
    setShowDifficultySelect(false)
    resetGame()
  }

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Prevent default for all game keys
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "w",
          "W",
          "a",
          "A",
          "s",
          "S",
          "d",
          "D",
          " ",
          "Escape",
        ].includes(e.key)
      ) {
        e.preventDefault()
      }

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          queueDirection({ x: 0, y: -1 }, true)
          break
        case "ArrowDown":
        case "s":
        case "S":
          queueDirection({ x: 0, y: 1 }, true)
          break
        case "ArrowLeft":
        case "a":
        case "A":
          queueDirection({ x: -1, y: 0 }, true)
          break
        case "ArrowRight":
        case "d":
        case "D":
          queueDirection({ x: 1, y: 0 }, true)
          break
        case " ":
          if (gameRunning) {
            setGameRunning(false)
          } else if (!gameOver) {
            setGameRunning(true)
          }
          break
        case "Escape":
          if (showDifficultySelect) setShowDifficultySelect(false)
          if (showInstructions) setShowInstructions(false)
          break
        case "r":
        case "R":
          if (e.ctrlKey || e.metaKey) return // Don't interfere with browser refresh
          resetGame()
          break
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [gameRunning, gameOver, direction, snake, obstacles, food])

  useEffect(() => {
    const currentSpeed = isAccelerating
      ? Math.max(40, DIFFICULTY_LEVELS[difficulty as keyof typeof DIFFICULTY_LEVELS].speed / 3) // 3x faster
      : DIFFICULTY_LEVELS[difficulty as keyof typeof DIFFICULTY_LEVELS].speed

    baseSpeedRef.current = DIFFICULTY_LEVELS[difficulty as keyof typeof DIFFICULTY_LEVELS].speed

    const gameInterval = setInterval(moveSnake, currentSpeed)
    return () => clearInterval(gameInterval)
  }, [moveSnake, difficulty, isAccelerating])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 1024 || "ontouchstart" in window) // Include tablets
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    return () => {
      if (accelerationTimeoutRef.current) {
        clearTimeout(accelerationTimeoutRef.current)
      }
    }
  }, [])

  // Announce score changes for screen readers
  useEffect(() => {
    if (score > 0 && lastScoreChange) {
      setAnnounceText(`Food eaten! Score is now ${score}`)
      setLastScoreChange(false)
      setTimeout(() => setAnnounceText(""), 1000)
    }
  }, [score, lastScoreChange])

  // Announce game state changes
  useEffect(() => {
    if (gameOver) {
      const message = isNewRecord
        ? `Game over! New session record with ${score} points!`
        : `Game over! Final score: ${score} points`
      setAnnounceText(message)
    } else if (gameRunning) {
      setAnnounceText("Game started")
    } else if (!gameRunning && score > 0) {
      setAnnounceText("Game paused")
    }
  }, [gameRunning, gameOver, score, isNewRecord])

  const renderGrid = () => {
    const grid = []
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const isSnake = snake.some((segment) => segment.x === col && segment.y === row)
        const isFood = food.x === col && food.y === row
        const isHead = snake[0]?.x === col && snake[0]?.y === row
        const isTail = snake.length > 1 && snake[snake.length - 1]?.x === col && snake[snake.length - 1]?.y === row
        const isObstacle = obstacles.has(`${col},${row}`)

        // Find the segment index for body styling
        const segmentIndex = snake.findIndex((segment) => segment.x === col && segment.y === row)
        const isBody = isSnake && !isHead && !isTail

        grid.push(
          <div
            key={`${row}-${col}`}
            className={`
            aspect-square border border-pink-200/30 transition-all duration-75 relative
            ${
              isSnake
                ? isHead
                  ? `bg-gradient-to-br from-pink-500 to-pink-600 rounded-full shadow-lg border-2 border-pink-400 relative overflow-visible ${isAccelerating ? "animate-pulse shadow-pink-400/50" : ""}`
                  : isTail
                    ? "bg-gradient-to-br from-pink-200 to-pink-300 rounded-full shadow-sm scale-75"
                    : "bg-gradient-to-br from-pink-300 to-pink-400 rounded-lg shadow-md border border-pink-300"
                : ""
            }
            ${isFood ? "bg-gradient-to-br from-rose-400 to-rose-500 rounded-full animate-pulse shadow-sm" : ""}
            ${isObstacle ? "bg-gradient-to-br from-gray-600 to-gray-700 shadow-md border border-gray-500" : ""}
          `}
          >
            {/* Snake Head Eyes */}
            {isHead && (
              <>
                <div className="absolute top-[15%] left-1/2 transform -translate-x-1/2 w-[28%] h-[28%] bg-white rounded-full shadow-sm"></div>
                <div className="absolute top-[20%] left-1/2 transform -translate-x-1/2 w-[22%] h-[22%] bg-gray-800 rounded-full"></div>
              </>
            )}

            {/* Body Pattern */}
            {isBody && (
              <div className="absolute inset-[12%] bg-gradient-to-br from-pink-200/50 to-transparent rounded-sm"></div>
            )}

            {/* Brick Pattern */}
            {isObstacle && (
              <div className="absolute inset-[10%] bg-gradient-to-br from-gray-400/30 to-transparent"></div>
            )}
          </div>,
        )
      }
    }
    return grid
  }

  return (
    <>
      <PWARegister />
      <div
        ref={gameContainerRef}
        tabIndex={0}
        role="application"
        aria-label="Snake Game - Use arrow keys or WASD to control the snake"
        aria-describedby="game-instructions"
        className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 p-2 sm:p-4 flex items-center justify-center outline-none focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
      >
        {/* Screen Reader Announcements */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announceText}
        </div>
        <div aria-live="assertive" className="sr-only">
          {gameOver && isNewRecord && "🏆 NEW SESSION RECORD!"}
        </div>

        <Card className="w-full max-w-4xl bg-white/80 backdrop-blur-sm shadow-2xl border-2 border-pink-200/50 rounded-3xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 text-white text-center py-3 sm:py-4 md:py-6">
            {/* Mobile & Tablet Layout - Stacked */}
            <div className="flex flex-col items-center gap-2 lg:hidden">
              {/* Current score only for mobile/tablet */}
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-2 sm:px-3 py-1 sm:py-2 border border-white/30">
                <div className="text-xs text-pink-100 font-medium">SCORE</div>
                <div className="text-base sm:text-lg font-bold text-white">{score}</div>
              </div>

              {/* Title below for mobile/tablet */}
              <h1 className="text-lg sm:text-xl font-bold tracking-wide drop-shadow-sm text-center">
                🐍 {DIFFICULTY_LEVELS[difficulty as keyof typeof DIFFICULTY_LEVELS].name}
              </h1>
            </div>

            {/* Desktop Layout - Side by side */}
            <div className="hidden lg:flex items-center justify-between">
              {/* Left spacer */}
              <div className="flex-1" />

              {/* Title Section - Always centered */}
              <div className="flex-1 flex justify-center">
                <h1 className="text-2xl xl:text-3xl font-bold tracking-wide drop-shadow-sm text-center whitespace-nowrap">
                  🐍 {DIFFICULTY_LEVELS[difficulty as keyof typeof DIFFICULTY_LEVELS].name}
                </h1>
              </div>

              {/* Score Section - Always on the right */}
              <div className="flex-1 flex justify-end">
                <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/30">
                  <div className="text-xs text-pink-100 font-medium">SCORE</div>
                  <div className="text-xl xl:text-2xl font-bold text-white">{score}</div>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-8">
            <div className="flex flex-col items-center space-y-4 sm:space-y-6">
              {/* Game Grid */}
              <div className="relative w-full max-w-lg">
                <div
                  className="grid gap-0 p-2 sm:p-4 bg-gradient-to-br from-pink-100/50 to-purple-100/50 rounded-2xl border-4 border-pink-200/60 shadow-inner select-none w-full aspect-square"
                  style={{
                    gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
                    touchAction: "none",
                  }}
                  role="grid"
                  aria-label={`Snake game grid, ${GRID_SIZE} by ${GRID_SIZE}. Snake position: row ${snake[0]?.y + 1}, column ${snake[0]?.x + 1}. Score: ${score}`}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  {renderGrid()}
                </div>

                {gameOver && (
                  <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                    <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-4 sm:p-6 text-center border-2 border-pink-200 shadow-xl">
                      <div className="text-3xl sm:text-4xl mb-2">{isNewRecord ? "🏆" : "💔"}</div>
                      <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-2">
                        {isNewRecord ? "New Session Record!" : "Game Over!"}
                      </h3>
                      <p className="text-pink-600 font-medium">Final Score: {score}</p>
                      {!isNewRecord && currentHighScore > 0 && (
                        <p className="text-gray-500 text-sm mt-1">Session Best: {currentHighScore}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Controls */}
              {isMobile && (
                <div className="flex flex-col items-center space-y-3 sm:space-y-4">
                  <p className="text-xs sm:text-sm text-gray-600 font-medium">📱 Touch Controls</p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 w-44 sm:w-52">
                    {/* Top row - Up button */}
                    <div></div>
                    <Button
                      onClick={() => handleDirectionClick({ x: 0, y: -1 })}
                      variant="outline"
                      size="lg"
                      className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border-2 border-pink-300 text-pink-600 hover:bg-pink-50 bg-white/80 backdrop-blur-sm shadow-lg active:scale-95 transition-all text-lg sm:text-xl font-bold focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                      aria-label="Move snake up"
                    >
                      ↑
                    </Button>
                    <div></div>

                    {/* Middle row - Left and Right buttons */}
                    <Button
                      onClick={() => handleDirectionClick({ x: -1, y: 0 })}
                      variant="outline"
                      size="lg"
                      className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border-2 border-pink-300 text-pink-600 hover:bg-pink-50 bg-white/80 backdrop-blur-sm shadow-lg active:scale-95 transition-all text-lg sm:text-xl font-bold focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                      aria-label="Move snake left"
                    >
                      ←
                    </Button>
                    <div></div>
                    <Button
                      onClick={() => handleDirectionClick({ x: 1, y: 0 })}
                      variant="outline"
                      size="lg"
                      className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border-2 border-pink-300 text-pink-600 hover:bg-pink-50 bg-white/80 backdrop-blur-sm shadow-lg active:scale-95 transition-all text-lg sm:text-xl font-bold focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                      aria-label="Move snake right"
                    >
                      →
                    </Button>

                    {/* Bottom row - Down button */}
                    <div></div>
                    <Button
                      onClick={() => handleDirectionClick({ x: 0, y: 1 })}
                      variant="outline"
                      size="lg"
                      className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border-2 border-pink-300 text-pink-600 hover:bg-pink-50 bg-white/80 backdrop-blur-sm shadow-lg active:scale-95 transition-all text-lg sm:text-xl font-bold focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                      aria-label="Move snake down"
                    >
                      ↓
                    </Button>
                    <div></div>
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center">
                <Button
                  onClick={startGame}
                  size="lg"
                  className="bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-500 hover:to-purple-500 text-white font-bold px-6 sm:px-8 py-2 sm:py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 border-0 text-sm sm:text-base focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                  aria-label={
                    gameOver
                      ? `Play again. Previous score was ${score}`
                      : gameRunning
                        ? `Pause game. Current score: ${score}`
                        : `Start game. Current score: ${score}`
                  }
                >
                  {gameOver ? (
                    <>
                      <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      Play Again
                    </>
                  ) : gameRunning ? (
                    <>
                      <Pause className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      Start Game
                    </>
                  )}
                </Button>

                <Button
                  onClick={resetGame}
                  variant="outline"
                  size="lg"
                  className="border-2 border-pink-300 text-pink-600 hover:bg-pink-50 font-medium px-4 sm:px-6 py-2 sm:py-3 rounded-2xl transition-all duration-200 bg-transparent text-sm sm:text-base focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                  aria-label="Reset game"
                >
                  <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Reset
                </Button>
              </div>

              {/* Menu */}
              <div className="flex flex-col items-center space-y-3 sm:space-y-4">
                <div className="flex gap-2 sm:gap-3">
                  <Button
                    onClick={() => setShowDifficultySelect(!showDifficultySelect)}
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all duration-200 text-xs sm:text-sm focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                    aria-label="Select difficulty"
                  >
                    <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    Difficulty
                  </Button>

                  <Button
                    onClick={() => setShowInstructions(!showInstructions)}
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all duration-200 text-xs sm:text-sm focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50"
                    aria-label={showInstructions ? "Hide instructions" : "How to play"}
                  >
                    <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    {showInstructions ? "Hide Instructions" : "How to Play"}
                  </Button>
                </div>

                {/* Difficulty Selection */}
                {showDifficultySelect && (
                  <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-4 sm:p-6 border-2 border-pink-200/50 shadow-lg backdrop-blur-sm max-w-md">
                    <div className="text-center space-y-4">
                      <div className="flex items-center justify-center mb-4">
                        <div className="text-xl sm:text-2xl">⚙️</div>
                        <h3 className="text-base sm:text-lg font-bold text-gray-800 ml-2">Select Difficulty</h3>
                      </div>

                      <div className="space-y-3">
                        {Object.entries(DIFFICULTY_LEVELS).map(([level, info]) => {
                          const levelNum = Number.parseInt(level)
                          const levelHighScore = sessionHighScores[levelNum] || 0
                          return (
                            <Button
                              key={level}
                              onClick={() => handleDifficultyChange(levelNum)}
                              variant={difficulty === levelNum ? "default" : "outline"}
                              className={`w-full p-3 sm:p-4 rounded-2xl transition-all duration-200 focus:ring-4 focus:ring-pink-300 focus:ring-opacity-50 ${
                                difficulty === levelNum
                                  ? "bg-gradient-to-r from-pink-400 to-purple-400 text-white border-0"
                                  : "border-2 border-pink-300 text-pink-600 hover:bg-pink-50"
                              }`}
                              aria-label={`Select ${info.subtitle} difficulty. ${levelHighScore > 0 ? `Session best: ${levelHighScore}` : "No games played yet"}`}
                              aria-pressed={difficulty === levelNum}
                            >
                              <div className="text-center">
                                <div className="font-bold text-sm sm:text-base">{info.subtitle}</div>
                                {levelHighScore > 0 && (
                                  <div className="text-xs opacity-75 mt-1">Session Best: {levelHighScore}</div>
                                )}
                              </div>
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {showInstructions && (
                  <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-4 sm:p-6 border-2 border-pink-200/50 shadow-lg backdrop-blur-sm max-w-md">
                    <div className="text-center space-y-3">
                      <div className="flex items-center justify-center mb-4">
                        <div className="text-xl sm:text-2xl">🎮</div>
                        <h3 className="text-base sm:text-lg font-bold text-gray-800 ml-2">How to Play</h3>
                      </div>

                      <div className="space-y-3 text-xs sm:text-sm">
                        {isMobile ? (
                          <>
                            <div className="flex items-center justify-center space-x-2">
                              <span className="bg-pink-100 text-pink-700 px-2 sm:px-3 py-1 sm:py-2 rounded-full font-medium text-xs sm:text-sm">
                                👆 Swipe on game grid
                              </span>
                              <span className="text-gray-400">or</span>
                              <span className="bg-purple-100 text-purple-700 px-2 sm:px-3 py-1 sm:py-2 rounded-full font-medium text-xs sm:text-sm">
                                Tap direction buttons
                              </span>
                            </div>
                            <div className="text-gray-600">
                              <p>• Swipe up/down/left/right to move the snake</p>
                              <p>• Or use the arrow buttons below</p>
                              <p>• Haptic feedback confirms your moves</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-center">
                              <span className="bg-pink-100 text-pink-700 px-3 sm:px-4 py-1 sm:py-2 rounded-full font-medium text-xs sm:text-sm">
                                ↑ ↓ ← → Arrow Keys or WASD
                              </span>
                            </div>
                            <div className="text-gray-600">
                              <p>• Use arrow keys or WASD to control the snake</p>
                              <p>• Press any movement key to start playing</p>
                              <p>• Press spacebar to pause/unpause</p>
                              <p>• Hold direction keys to accelerate toward walls</p>
                            </div>
                          </>
                        )}

                        <div className="border-t border-pink-200 pt-3 space-y-2 text-gray-600">
                          <div className="flex items-center justify-center space-x-2">
                            <span className="text-rose-500">🍎</span>
                            <span>Eat the food to grow and score points</span>
                          </div>
                          <div className="flex items-center justify-center space-x-2">
                            <span className="text-red-500">⚠️</span>
                            <span>Don't hit your own body or obstacles!</span>
                          </div>
                          <div className="flex items-center justify-center space-x-2">
                            <span className="text-yellow-500">🏆</span>
                            <span>Each food gives you 10 points</span>
                          </div>
                          <div className="flex items-center justify-center space-x-2">
                            <span className="text-blue-500">🧱</span>
                            <span>Gray bricks appear in higher difficulties</span>
                          </div>
                          <div className="flex items-center justify-center space-x-2">
                            <span className="text-purple-500">🎯</span>
                            <span>Beat your session best on each difficulty!</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <PWAInstall />
        <div id="game-instructions" className="sr-only">
          Snake game instructions: Use arrow keys or WASD to move the snake. Eat the red food to grow and score points.
          Avoid hitting your own body or gray obstacles. Press spacebar to pause. Press R to reset. Press Escape to
          close menus.
        </div>
      </div>
    </>
  )
}
