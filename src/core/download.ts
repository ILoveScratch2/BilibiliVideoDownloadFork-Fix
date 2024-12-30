import { IpcMainEvent } from 'electron'
import { mergeVideoAudio } from './media'
import { randUserAgent, sleep } from '../utils'
import { downloadSubtitle } from './subtitle'
import { TaskData, SettingData } from '../type'
import store from './mainStore'
import { throttle } from 'lodash'
import { STATUS } from '../assets/data/status'

const log = require('electron-log')
const stream = require('stream')
const { promisify } = require('util')
const fs = require('fs-extra')
const got = require('got')
const pipeline = promisify(stream.pipeline)

// 新增暂停和恢复的全局状态管理
const downloadStates: { [key: string]: { 
  isPaused: boolean, 
  resumeDownload: () => Promise<void> | null 
} } = {}

export const pauseDownload = (taskId: string) => {
  if (downloadStates[taskId]) {
    downloadStates[taskId].isPaused = true
    return true
  }
  return false
}

export const resumeDownload = async (taskId: string, videoInfo: TaskData, event: IpcMainEvent, setting: SettingData) => {
  if (downloadStates[taskId] && downloadStates[taskId].resumeDownload) {
    await downloadStates[taskId].resumeDownload()
    return true
  }
  return false
}

export default async (videoInfo: TaskData, event: IpcMainEvent, setting: SettingData) => {
  const taskId = videoInfo.id
  downloadStates[taskId] = { 
    isPaused: false, 
    resumeDownload: null 
  }

  log.info(videoInfo.id, videoInfo.title)
  const takeInfo = store.get(`taskList.${videoInfo.id}`)
  log.info('mainStore', takeInfo, takeInfo && takeInfo.status)

  const updateData = {
    id: videoInfo.id,
    status: STATUS.VIDEO_DOWNLOADING,
    progress: Math.round(0)
  }
  event.reply('download-video-status', updateData)
  store.set(`taskList.${videoInfo.id}`, {
    ...videoInfo,
    ...updateData
  })

  const fileName = videoInfo.filePathList[0].substring(0, videoInfo.filePathList[0].length - 4)
  try {
    if (!fs.existsSync(videoInfo.fileDir)) {
      fs.mkdirSync(`${videoInfo.fileDir}`, {
        recursive: true
      })
      log.info(`文件夹创建成功：${videoInfo.fileDir}`)
    } else {
      log.info(`文件夹已存在：${videoInfo.fileDir}`)
    }
  } catch (error) {
    log.error(`创建文件夹失败：${error}`)
  }

  // 下载封面和字幕逻辑保持不变
  if (setting.isCover) {
    const imageConfig = {
      headers: {
        'User-Agent': randUserAgent(),
        cookie: `SESSDATA=${setting.SESSDATA}`
      }
    }
    await pipeline(
      got.stream(videoInfo.cover, imageConfig)
        .on('error', (error: any) => {
          console.log(error)
        }),
      fs.createWriteStream(videoInfo.filePathList[1])
    )
    log.info(`✅ 下载封面完成 ${videoInfo.title}`)
  }

  log.info(`下载字幕 "${JSON.stringify(videoInfo.subtitle)}"`)
  if (setting.isSubtitle &&
    Array.isArray(videoInfo.subtitle) &&
    videoInfo.subtitle.length > 0) {
    downloadSubtitle(fileName, videoInfo.subtitle)
    log.info(`✅ 下载字幕完成 ${videoInfo.title}`)
  }

  if (setting.isDanmaku) {
    event.reply('download-danmuku', videoInfo.cid, videoInfo.title, `${fileName}.ass`)
  }

  const downloadConfig = {
    headers: {
      'User-Agent': randUserAgent(),
      referer: videoInfo.url
    },
    cookie: `SESSDATA=${setting.SESSDATA}`
  }

  // 视频下载支持暂停和恢复
  const videoDownloadPromise = new Promise<void>(async (resolve, reject) => {
    const videoStream = got.stream(videoInfo.downloadUrl.video, downloadConfig)
    const writeStream = fs.createWriteStream(videoInfo.filePathList[2])

    let downloadedBytes = 0
    let totalBytes = 0

    videoStream.on('response', (response) => {
      totalBytes = parseInt(response.headers['content-length'] || '0', 10)
    })

    videoStream.on('data', (chunk) => {
      if (downloadStates[taskId].isPaused) {
        videoStream.pause()
      }
      downloadedBytes += chunk.length
    })

    videoStream.on('error', (error) => {
      log.error(`视频下载失败：${videoInfo.title}--${error.message}`)
      const updateData = {
        id: videoInfo.id,
        status: STATUS.FAIL
      }
      store.set(`taskList.${videoInfo.id}`, Object.assign(videoInfo, updateData))
      event.reply('download-video-status', updateData)
      reject(error)
    })

    writeStream.on('error', (error) => {
      reject(error)
    })

    downloadStates[taskId].resumeDownload = async () => {
      if (downloadStates[taskId].isPaused) {
        const updateData = {
          id: videoInfo.id,
          status: STATUS.VIDEO_DOWNLOADING,
          progress: Math.round((downloadedBytes / totalBytes) * 100 * 0.75)
        }
        event.reply('download-video-status', updateData)
        store.set(`taskList.${videoInfo.id}`, Object.assign(videoInfo, updateData))
        downloadStates[taskId].isPaused = false
        videoStream.resume()
      }
    }

    videoStream.pipe(writeStream)

    writeStream.on('finish', () => {
      log.info(`✅ 下载视频完成 ${videoInfo.title}`)
      resolve()
    })
  })

  await videoDownloadPromise

  // 音频下载同样支持暂停和恢复
  const audioDownloadPromise = new Promise<void>(async (resolve, reject) => {
    const audioStream = got.stream(videoInfo.downloadUrl.audio, downloadConfig)
    const writeStream = fs.createWriteStream(videoInfo.filePathList[3])

    let downloadedBytes = 0
    let totalBytes = 0

    audioStream.on('response', (response) => {
      totalBytes = parseInt(response.headers['content-length'] || '0', 10)
    })

    audioStream.on('data', (chunk) => {
      if (downloadStates[taskId].isPaused) {
        audioStream.pause()
      }
      downloadedBytes += chunk.length
    })

    audioStream.on('error', (error) => {
      log.error(`音频下载失败：${videoInfo.title} ${error.message}`)
      const updateData = {
        id: videoInfo.id,
        status: STATUS.FAIL
      }
      store.set(`taskList.${videoInfo.id}`, Object.assign(videoInfo, updateData))
      event.reply('download-video-status', updateData)
      reject(error)
    })

    writeStream.on('error', (error) => {
      reject(error)
    })

    downloadStates[taskId].resumeDownload = async () => {
      if (downloadStates[taskId].isPaused) {
        const updateData = {
          id: videoInfo.id,
          status: STATUS.AUDIO_DOWNLOADING,
          progress: Math.round((downloadedBytes / totalBytes) * 100 * 0.22 + 75)
        }
        event.reply('download-video-status', updateData)
        store.set(`taskList.${videoInfo.id}`, Object.assign(videoInfo, updateData))
        downloadStates[taskId].isPaused = false
        audioStream.resume()
      }
    }

    audioStream.pipe(writeStream)

    writeStream.on('finish', () => {
      log.info(`✅ 下载音频 ${videoInfo.title}`)
      resolve()
    })
  })

  await audioDownloadPromise

  // 合成视频逻辑保持不变
  if (setting.isMerge) {
    const updateData = {
      id: videoInfo.id,
      status: STATUS.MERGING,
      progress: 98
    }
    event.reply('download-video-status', updateData)
    store.set(`taskList.${videoInfo.id}`, {
      ...videoInfo,
      ...updateData
    })
    try {
      const res = await mergeVideoAudio(
        videoInfo.filePathList[2],
        videoInfo.filePathList[3],
        videoInfo.filePathList[0]
      )
      log.info(`✅ 音视频合成成功：${videoInfo.title} ${res}`)
      const updateData = {
        id: videoInfo.id,
        status: STATUS.COMPLETED,
        progress: 100
      }
      event.reply('download-video-status', updateData)
      store.set(`taskList.${videoInfo.id}`, {
        ...videoInfo,
        ...updateData
      })
    } catch (error: any) {
      log.error(`音视频合成失败：${videoInfo.title} ${error.message}`)
      const updateData = {
        id: videoInfo.id,
        status: STATUS.FAIL
      }
      event.reply('download-video-status', updateData)
      store.set(`taskList.${videoInfo.id}`, {
        ...videoInfo,
        ...updateData
      })
    } finally {
      // 删除原视频
      const handleDeleteFile = (setting: SettingData, videoInfo: TaskData) => {
        // 删除原视频
        if (setting.isDelete) {
          const filePathList = videoInfo.filePathList
          fs.removeSync(filePathList[2])
          fs.removeSync(filePathList[3])
        }
      }
      handleDeleteFile(setting, videoInfo)
    }
  } else {
    const updateData = {
      id: videoInfo.id,
      status: STATUS.COMPLETED,
      progress: 100
    }
    event.reply('download-video-status', updateData)
    store.set(`taskList.${videoInfo.id}`, {
      ...videoInfo,
      ...updateData
    })
    const handleDeleteFile = (setting: SettingData, videoInfo: TaskData) => {
      // 删除原视频
      if (setting.isDelete) {
        const filePathList = videoInfo.filePathList
        fs.removeSync(filePathList[2])
        fs.removeSync(filePathList[3])
      }
    }
    handleDeleteFile(setting, videoInfo)
  }
}
