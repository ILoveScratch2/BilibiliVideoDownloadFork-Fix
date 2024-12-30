const STATUS = {
  /** 已完成 */
  COMPLETED: 0,
  /** 准备开始下载 */
  PLAN_START: 6,
  /** 视频下载中 */
  VIDEO_DOWNLOADING: 1,
  /** 音频下载中 */
  AUDIO_DOWNLOADING: 2,
  /** 合并中 */
  MERGING: 3,
  /** 排队中 */
  PENDING: 4,
  /** 失败 */
  FAIL: 5,
  /** 暂停中 */
  PAUSED: 7
}

const downloadStatusMap = {
  [STATUS.COMPLETED]: {
    label: '已完成',
    value: 'success'
  },
  [STATUS.PLAN_START]: {
    label: '准备开始下载',
    value: 'active'
  },
  [STATUS.VIDEO_DOWNLOADING]: {
    label: '视频下载中',
    value: 'active'
  },
  [STATUS.AUDIO_DOWNLOADING]: {
    label: '音频下载中',
    value: 'active'
  },
  [STATUS.MERGING]: {
    label: '视频合成中',
    value: 'active'
  },
  [STATUS.PENDING]: {
    label: '排队中',
    value: 'active'
  },
  [STATUS.FAIL]: {
    label: '下载失败',
    value: 'exception'
  },
  [STATUS.PAUSED]: {
    label: '暂停中',
    value: 'warning'
  }
}

export {
  downloadStatusMap,
  STATUS
}
