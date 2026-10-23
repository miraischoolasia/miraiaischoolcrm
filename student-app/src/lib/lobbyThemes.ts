// The lobby's picture sets, one per school (white-label). A school picks its
// set in the CRM (Student app settings: home_theme); the pictures ship with
// the app in public/lobby/<key>/ (never in Supabase Storage). A new school
// adds its folder and an entry here; the layout is the same for every school.

import type { LobbyScene } from './lobbyLayout'
import type { ReportWords } from './lessonReportRules'

export type LobbyTheme = {
  key: string
  // Where the pictures are (public/lobby/<key>/, the same file names for every set).
  folder: string
  // The background and its platform when public/lobby/<key>/scene.json is
  // missing or cannot be read (that file wins, so a new picture needs no code).
  scene: LobbyScene
  // The word under the school's shield, top left (until the school sends its emblem).
  emblemWord: string
  // The lesson report's words (a set without them uses English).
  report?: ReportWords
  // The words on the screen (the set's pictures already carry their own words).
  words: {
    enterClass: string
    startLearning: string
    minutesToStart: (minutes: number) => string
    classOn: string
    comingSoon: string
    waitForTeacher: string
    coins: string
    modes: string
    modeVideos: string
    modePractice: string
    modeLiveReview: string
    close: string
    // Daily check-in and tasks ({coins}, {days}).
    checkinTitle: string
    checkinButton: string
    checkinDone: string
    checkinStreak: string
    tasksTitle: string
    tasksEmpty: string
    claim: string
    claimed: string
    taskCoins: string
  }
  // The game sign-in page's words ({school} = the school's name).
  signIn: {
    welcome: string
    subtitle: string
    student: string
    parent: string
    studentLogin: string
    parentLogin: string
    studentHint: string
    parentHint: string
    password: string
    showPassword: string
    hidePassword: string
    remember: string
    forgot: string
    signIn: string
    signingIn: string
    missing: string
    help: string
    contact: string
    whatsappMessage: string
  }
}

export const lobbyThemes: Record<string, LobbyTheme> = {
  eduhero: {
    key: 'eduhero',
    folder: '/lobby/eduhero',
    scene: {
      background: 'bg-lobby-3344.webp',
      backgrounds: [
        { file: 'bg-lobby-1672.webp', width: 1672 },
        { file: 'bg-lobby-2560.webp', width: 2560 },
        { file: 'bg-lobby-3344.webp', width: 3344 },
      ],
      width: 3344,
      height: 1882,
      focusX: 0.5,
      focusY: 0.75,
      platformX: 0.4426,
      platformY: 0.8289,
      heroHeight: 0.7311,
      buttonsMaxScale: 2.18,
      heroMaxScale: 2.1,
      heroVideo: { webm: 'hero-loop.webm', poster: 'hero-loop-poster.webp', width: 444, height: 708, feetX: 222, feetY: 679.5, heroPixels: 679 },
    },
    emblemWord: 'EDUHERO',
    report: {
      back: '大厅',
      missedTitle: '今天的课你没来',
      missedText: '没关系！课堂录影会放在「影院」，有空看一看，下次一起上课。',
      watchVideo: '看课堂录影',
      title: '下课啦！做得好',
      pointsToday: '今天得到的分数',
      place: (place) => `全班第 ${place} 名！`,
      right: '答对',
      onTime: '准时',
      arrival: '到课',
      late: (minutes) => `迟到 ${minutes} 分`,
      minutesIn: '分钟上课',
      whereFrom: '分数怎么来的',
      rightAnswers: '答对题目',
      writing: '老师正在写今天的评语，等一下再来看',
      nextLesson: (day, time) => `下一堂课：${day} ${time}`,
      inDays: (days) => `还有 ${days} 天`,
      today: '就是今天',
      tomorrow: '明天',
      home: '回到大厅',
      seeQuestions: '看今天的题目和答案',
      weekdays: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
      months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    },
    words: {
      enterClass: '进入课堂',
      startLearning: '开始学习',
      minutesToStart: (minutes) => `${minutes} 分钟后开课`,
      classOn: '正在上课',
      comingSoon: '即将推出',
      waitForTeacher: '老师开课后就能进入课堂',
      coins: '金币',
      modes: '切换模式',
      modeVideos: '学习影片',
      modePractice: '每日练习',
      modeLiveReview: 'Live 问答复习',
      close: '关闭',
      checkinTitle: '每日签到',
      checkinButton: '签到 +{coins} 金币',
      checkinDone: '今天已经签到了！',
      checkinStreak: '连续签到 {days} 天',
      tasksTitle: '每日任务',
      tasksEmpty: '今天没有任务',
      claim: '领取',
      claimed: '已领取',
      taskCoins: '+{coins} 金币',
    },
    signIn: {
      welcome: 'Welcome to {school}',
      subtitle: 'Enter your learning world',
      student: 'Student',
      parent: 'Parent',
      studentLogin: 'Student ID / Email',
      parentLogin: 'Parent login name',
      studentHint: 'Use the student ID the school gave you.',
      parentHint: 'Use the parent login the school sent you.',
      password: 'Password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      remember: 'Remember me',
      forgot: 'Forgot password?',
      signIn: 'SIGN IN',
      signingIn: 'SIGNING IN…',
      missing: 'Please type your login name and password.',
      help: 'Need help?',
      contact: 'Contact the school',
      whatsappMessage: 'Hi, I need help signing in to the {school} student app.',
    },
  },
}

export const lobbyThemeKeys = Object.keys(lobbyThemes)
