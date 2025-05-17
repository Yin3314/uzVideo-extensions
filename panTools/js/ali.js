class Ali {
    constructor() {
        this.shareTokenCache = {}
        this.saveFileIdCaches = {}
        this.saveDirId = null
        ;(this.userDriveId = null), (this.saveDirName = 'uz影视')
        this.user = {}
        this.oauth = {}
        this.isSVip = true
        this.token = ''
        this.apiUrl = 'https://api.aliyundrive.com/'
        this.openApiUrl = 'https://open.aliyundrive.com/adrive/v1.0/'
        this.updateToken = () => {}
        this.baseHeaders = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) uc-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch',
            referer: 'https://www.aliyundrive.com',
            'Content-Type': 'application/json',
        }
    }
    uzTag = ''

    get panName() {
        return PanType.Ali
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    //验证时间戳
    verifyTimestamp(timestamp) {
        // 时间为了保证任意时区都一致 所以使用格林威治时间
        const currentTimeString = new Date().toISOString()
        const currentTime = new Date(currentTimeString).getTime()
        const requestTime = new Date(timestamp).getTime()
        const timeDifference = Math.abs(currentTime - requestTime)
        // 检查时间差是否小于2分钟（120000毫秒）
        return timeDifference < 120000
    }

    async api(url, data, headers, retry) {
        headers = headers || {}
        const auth = url.startsWith('adrive/')
        Object.assign(headers, this.baseHeaders)
        if (auth) {
            Object.assign(headers, {
                Authorization: this.user.auth,
            })
        }

        const leftRetry = retry || 3
        while (leftRetry > 0) {
            try {
                const response = await req(this.apiUrl + url, {
                    method: 'post',
                    headers: headers,
                    data: JSON.stringify(data),
                })
                if (response.code === 401) {
                    this.cookie = ''
                    return {}
                }
                const resp = response.data
                return resp
            } catch (e) {}
            leftRetry--
            await this.delay(1000)
        }
        return resp
    }

    async openApi(url, data, headers, retry) {
        headers = headers || {}
        Object.assign(headers, {
            Authorization: this.oauth.auth,
        })

        const leftRetry = retry || 3
        while (leftRetry > 0) {
            try {
                const response = await req(this.openApiUrl + url, {
                    method: 'post',
                    headers: headers,
                    data: JSON.stringify(data),
                })
                if (response.code === 401) {
                    this.cookie = ''
                    return {}
                }
                const resp = response.data
                return resp
            } catch (e) {}
            leftRetry--
            await this.delay(1000)
        }
        return resp
    }

    // 一键就绪
    async oneKeyReady() {
        await this.login()
        await this.openAuth()
        if (this.userDriveId == null) {
            const driveInfo = await this.openApi(`user/getDriveInfo`, {})
            this.userDriveId = driveInfo.resource_drive_id
        }
    }

    //用户登陆
    async login() {
        if (!this.user.user_id || !this.verifyTimestamp(this.user.expire_time)) {
            try {
                const loginResp = await req('https://auth.aliyundrive.com/v2/account/token', {
                    method: 'post',
                    headers: this.baseHeaders,
                    data: {
                        refresh_token: this.token,
                        grant_type: 'refresh_token',
                    },
                })

                if (loginResp.code == 200) {
                    this.user = loginResp.data
                    this.user.expire_time = new Date().toISOString()
                    this.user.auth = `${loginResp.data.token_type} ${loginResp.data.access_token}`
                    this.user.token = loginResp.data.refresh_token

                    this.updateToken()
                }
            } catch (e) {}
        }
    }

    //授权第三方Alist
    async openAuth() {
        if (!this.oauth.access_token || !this.verifyTimestamp(this.oauth.expire_time)) {
            try {
                const openToken = this.oauth.token || (await this.getOpenToken())
                const openResp = await req('https://api.nn.ci/alist/ali_open/token', {
                    method: 'post',
                    headers: this.baseHeaders,
                    data: {
                        refresh_token: openToken,
                        grant_type: 'refresh_token',
                    },
                })

                if (openResp.code == 200) {
                    this.oauth = openResp.data
                    this.oauth.expire_time = new Date().toISOString()
                    this.oauth.auth = `${openResp.data.token_type} ${openResp.data.access_token}`
                    this.oauth.token = openResp.data.refresh_token
                }
            } catch (e) {}
        }
    }

    //根据授权码获取token
    async getOpenToken() {
        try {
            let code = await this.getOpenCode()
            let openResp = await req('https://api.nn.ci/alist/ali_open/code', {
                method: 'post',
                headers: this.baseHeaders,
                data: {
                    code: code,
                    grant_type: 'authorization_code',
                },
            })
            let openToken = openResp.data.refresh_token
            return openToken
        } catch (e) {}
    }

    //用户授权，获取授权码code
    async getOpenCode() {
        let url =
            'https://open.aliyundrive.com/oauth/users/authorize?client_id=76917ccccd4441c39457a04f6084fb2f&redirect_uri=https://alist.nn.ci/tool/aliyundrive/callback&scope=user:base,file:all:read,file:all:write&state='
        let headers = this.baseHeaders
        Object.assign(headers, {
            Authorization: this.user.auth,
        })

        try {
            let openResp = await req(url, {
                method: 'post',
                headers: headers,
                data: {
                    authorize: 1,
                    scope: 'user:base,file:all:read,file:all:write',
                },
            })
            let uri = openResp.data.redirectUri
            let regex = /http.*code=(.*)/
            let matches = regex.exec(uri)
            let code = matches[1]
            return code
        } catch (e) {}
    }

    /**
     * 根据链接获取分享ID和文件夹ID
     * @param {string} url
     * @returns {null|{shareId: string, folderId: string}}
     **/
    getShareData(url) {
        let regex = /https:\/\/www\.alipan\.com\/s\/([^\\/]+)(\/folder\/([^\\/]+))?|https:\/\/www\.aliyundrive\.com\/s\/([^\\/]+)(\/folder\/([^\\/]+))?/
        let matches = regex.exec(url)
        if (matches) {
            return {
                shareId: matches[1] || matches[4],
                folderId: matches[3] || matches[6] || 'root',
            }
        }
        return null
    }

    /**
     * 获取分享token
     * @param {{shareId: string, sharePwd: string}} shareData
     **/
    async getShareToken(shareData) {
        if (!this.shareTokenCache.hasOwnProperty(shareData.shareId)) {
            delete this.shareTokenCache[shareData.shareId]
            const shareToken = await this.api(`v2/share_link/get_share_token`, {
                share_id: shareData.shareId,
                share_pwd: shareData.sharePwd || '',
            })
            if (shareToken.expire_time) {
                this.shareTokenCache[shareData.shareId] = shareToken
            }
        }
    }

    async clearSaveDir() {
        if (this.saveDirId == null) return
        const listData = await this.openApi(`openFile/list`, {
            drive_id: this.userDriveId,
            parent_file_id: this.saveDirId,
            limit: 100,
            order_by: 'name',
            order_direction: 'DESC',
        })
        if (listData.items) {
            for (const item of listData.items) {
                const del = await this.openApi(`openFile/delete`, {
                    drive_id: this.userDriveId,
                    file_id: item.file_id,
                })
            }
        }
        this.saveFileIdCaches = {}
    }

    async createSaveDir(clean = false) {
        if (!this.user.device_id) return
        if (this.saveDirId) {
            // 删除所有子文件
            // if (clean) await this.clearSaveDir()
            // await this.clearSaveDir()
            return
        }

        if (this.userDriveId) {
            const listData = await this.openApi(`openFile/list`, {
                drive_id: this.userDriveId,
                parent_file_id: 'root',
                limit: 100,
                order_by: 'name',
                order_direction: 'DESC',
            })
            if (listData.items) {
                for (const item of listData.items) {
                    if (item.name === this.saveDirName) {
                        this.saveDirId = item.file_id
                        // await this.clearSaveDir()
                        break
                    }
                }
                if (!this.saveDirId) {
                    const create = await this.openApi(`openFile/create`, {
                        check_name_mode: 'refuse',
                        drive_id: this.userDriveId,
                        name: this.saveDirName,
                        parent_file_id: 'root',
                        type: 'folder',
                    })

                    if (create.file_id) {
                        this.saveDirId = create.file_id
                    }
                }
            }
        }
    }

    /**
     * 保存分享的文件到个人网盘
     * @param {Object} params 保存参数
     * @param {string} params.shareId 分享ID
     * @param {string} params.fileId 文件ID
     * @param {boolean} [params.clean=false] 是否清理已存在的保存目录
     * @returns {Promise<string|null>} 返回保存成功的文件ID，失败返回null
     */
    async save({ shareId, fileId, clean = false }) {
        await this.oneKeyReady()
        await this.createSaveDir(clean)

        if (this.saveDirId == null) return null
        await this.getShareToken({ shareId })
        if (!this.shareTokenCache.hasOwnProperty(shareId)) return null
        const saveResult = await this.api(
            `adrive/v2/file/copy`,
            {
                file_id: fileId,
                share_id: shareId,
                auto_rename: true,
                to_parent_file_id: this.saveDirId,
                to_drive_id: this.userDriveId,
            },
            {
                'X-Share-Token': this.shareTokenCache[shareId].share_token,
            }
        )
        if (saveResult.file_id) return saveResult.file_id
        return false
    }

    async getLiveTranscoding({ fileId, isMount = false }) {
        const transcoding = await this.openApi(`openFile/getVideoPreviewPlayInfo`, {
            file_id: isMount ? fileId : this.saveFileIdCaches[fileId],
            drive_id: this.userDriveId,
            category: 'live_transcoding',
            url_expire_sec: '14400',
        })
        if (transcoding.video_preview_play_info && transcoding.video_preview_play_info.live_transcoding_task_list) {
            let liveList = transcoding.video_preview_play_info.live_transcoding_task_list
            liveList.sort((a, b) => b.template_width - a.template_width)
            const nameMap = {
                QHD: '超清',
                FHD: '高清',
                HD: '标清',
                SD: '普画',
                LD: '极速',
            }

            let urls = []
            for (let i = 0; i < liveList.length; i++) {
                const video = liveList[i]
                const url = video.url ?? ''
                const priority = video.template_width
                const name = nameMap[video.template_id] ?? video.template_id

                if (url.length > 0) {
                    urls.push({
                        url: url,
                        name: name,
                        priority: priority,
                        headers: {},
                    })
                }
            }
            return urls
        }
        return []
    }

    async getDownload({ fileId, isMount = false }) {
        const down = await this.openApi(`openFile/getDownloadUrl`, {
            file_id: isMount ? fileId : this.saveFileIdCaches[fileId],
            drive_id: this.userDriveId,
        })

        if (down.url) {
            return [
                {
                    url: down.url,
                    name: '原画',
                    priority: 9999,
                    headers: {},
                },
            ]
        }
        return []
    }

    findBestLCS(mainItem, targetItems) {
        const results = []
        let bestMatchIndex = 0
        for (let i = 0; i < targetItems.length; i++) {
            const currentLCS = UZUtils.lcs(mainItem.name, targetItems[i].name)
            results.push({ target: targetItems[i], lcs: currentLCS })
            if (currentLCS.length > results[bestMatchIndex].lcs.length) {
                bestMatchIndex = i
            }
        }
        const bestMatch = results[bestMatchIndex]
        return {
            allLCS: results,
            bestMatch: bestMatch,
            bestMatchIndex: bestMatchIndex,
        }
    }

    async listFile(shareId, folderId, videos, subtitles, nextMarker) {
        const subtitleExts = ['srt', 'ass', 'scc', 'stl', 'ttml']
        const listData = await this.api(
            `adrive/v2/file/list_by_share`,
            {
                share_id: shareId,
                parent_file_id: folderId,
                limit: 200,
                order_by: 'name',
                order_direction: 'ASC',
                marker: nextMarker || '',
            },
            {
                'X-Share-Token': this.shareTokenCache[shareId].share_token,
            }
        )

        const items = listData.items
        if (!items) return []

        if (listData.next_marker) {
            const nextItems = await this.listFile(shareId, folderId, videos, subtitles, listData.next_marker)
            for (const item of nextItems) {
                items.push(item)
            }
        }

        const subDir = []

        for (const item of items) {
            if (item.type === 'folder') {
                subDir.push(item)
            } else if (item.type === 'file' && item.category === 'video') {
                if (item.size < 1024 * 1024 * 5) continue
                item.name = item.name.replace(/玩偶哥.*【神秘的哥哥们】/g, '')
                videos.push(item)
            } else if (item.type === 'file' && subtitleExts.some((x) => item.file_extension.endsWith(x))) {
                subtitles.push(item)
            }
        }

        for (const dir of subDir) {
            const subItems = await this.listFile(dir.share_id, dir.file_id, videos, subtitles)
            for (const item of subItems) {
                items.push(item)
            }
        }

        return items
    }

    fileName = ''
    /**
     * 获取文件列表
     * @param {string} shareUrl
     * @returns {@Promise<PanListDetail>}
     **/
    async getFilesByShareUrl(shareUrl) {
        const data = new PanListDetail()
        const shareData = typeof shareUrl === 'string' ? this.getShareData(shareUrl) : shareUrl
        if (!shareData) {
            data.error = '分享链接无效'
            return data
        }
        await this.getShareToken(shareData)
        if (!this.shareTokenCache[shareData.shareId]) {
            data.error = '分享失效'
            return data
        }

        const videos = []
        const subtitles = []

        await this.listFile(shareData.shareId, shareData.folderId, videos, subtitles)

        videos.forEach((item) => {
            // 复制 item
            const element = JSON.parse(JSON.stringify(item))
            let size = element.size / 1024 / 1024
            let unit = 'MB'
            if (size >= 1000) {
                size = size / 1024
                unit = 'GB'
            }
            size = size.toFixed(1)
            const remark = `[${size}${unit}]`

            const videoItem = new PanVideoItem()
            videoItem.data = element
            videoItem.panType = this.panName
            videoItem.name = element.name
            if (kAppVersion > 1650) {
                videoItem.remark = remark
            } else {
                videoItem.name = `${element.name} ${remark}`
            }
            data.videos.push(videoItem)
        })

        if (subtitles.length > 0) {
            videos.forEach((item) => {
                var matchSubtitle = this.findBestLCS(item, subtitles)
                if (matchSubtitle.bestMatch) {
                    item.subtitle = matchSubtitle.bestMatch.target
                }
            })
        }

        return data
    }

    /**
     * 获取播放信息
     * @param {{flag:string,share_id:string,shareToken:string,file_id:string,shareFileToken:string }} data
     * @returns {@Promise<PanPlayInfo>}
     */
    async getPlayUrl(data) {
        let playData = new PanPlayInfo()
        playData.urls = []
        if (this.cookie.length < 1) {
            playData.error = '请先在环境变量中添加 阿里Token'
            return playData
        }
        try {
            const shareId = data.share_id
            const fileId = data.file_id
            if (!this.saveFileIdCaches[fileId]) {
                const saveFileId = await this.save({
                    shareId,
                    fileId,
                    clean: false,
                })
                if (!saveFileId) return new PanPlayInfo('', '转存失败～')
                this.saveFileIdCaches[fileId] = saveFileId
            }
            let rawUrls = await this.getDownload({ fileId: fileId })
            let transcodingUrls = await this.getLiveTranscoding({ fileId: fileId })
            playData.urls = [...rawUrls, ...transcodingUrls]
            playData.urls.sort((a, b) => b.priority - a.priority)
            playData.url = playData.urls[0].url
        } catch (error) {
            playData = new PanPlayInfo()
            playData.error = error.toString()
        }
        this.clearSaveDir()
        return playData
    }

    /**
     * 下一次获取文件列表时使用的marker
     * key: file_id
     * value: marker
     */
    nextMap = new Map()

    /**
     * 获取文件列表
     * @param {PanMountListData?} args
     * @param {boolean} isRoot
     * @param {number} page
     */
    async getFileList({ args, isRoot, page }) {
        let list = []
        let fid = isRoot ? 'root' : args?.data.file_id
        let marker = this.nextMap[fid] ?? ''
        if (page == 1) {
            marker = ''
        } else if (marker === '') {
            return list
        }

        const listData = await this.openApi(`openFile/list`, {
            drive_id: this.userDriveId,
            parent_file_id: fid,
            limit: 200,
            order_by: 'name',
            order_direction: 'DESC',
            marker: marker,
        })

        let items = listData.items
        this.nextMap[fid] = listData.next_marker

        for (let index = 0; index < items.length; index++) {
            const element = items[index]

            let size = (element?.size ?? 0) / 1024 / 1024
            let remark = ''
            if (size > 0) {
                let unit = 'MB'
                if (size >= 1000) {
                    size = size / 1024
                    unit = 'GB'
                }
                size = size.toFixed(1)
                remark = `[${size}${unit}]`
            }

            let dataType = PanDataType.Dir
            if (element.category == 'video') {
                dataType = PanDataType.Video
            } else if (element.category) {
                dataType = PanDataType.Unknown
            }
            list.push({
                name: element.name,
                panType: PanType.Ali,
                dataType: dataType,
                data: {
                    file_id: element.file_id,
                },
                remark: remark,
            })
        }
        return list
    }
}
function base64Encode(text) {
    return Crypto.enc.Base64.stringify(Crypto.enc.Utf8.parse(text))
}
function base64Decode(text) {
    return Crypto.enc.Utf8.stringify(Crypto.enc.Base64.parse(text))
}
class axios {
    /**
     * 发送请求
     * @param {object} config 请求配置
     * @returns {Promise<ProData>}
     */
    static async request(config) {
        let {
            url,
            method = 'GET',
            headers = {},
            data,
            params,
            responseType,
            addressType,
            maxRedirects,
        } = config

        let options = {
            method,
            headers,
            data,
            queryParameters: params,
            responseType,
            addressType,
            maxRedirects,
        }

        const response = await req(url, options)
        response.status = response.code
        return response
    }

    /**
     * GET 请求
     * @param {string} url 请求的URL
     * @param {object} [config] 可选的请求配置
     * @returns {Promise<ProData>}
     */
    static async get(url, config = {}) {
        return await axios.request({ ...config, url, method: 'GET' })
    }
    /**
     * POST 请求
     * @param {string} url 请求的URL
     * @param {object} [data] 可选的请求数据
     * @param {object} [config] 可选的请求配置
     * @returns {Promise<ProData>}
     */
    static async post(url, data, config = {}) {
        return await axios.request({ ...config, url, method: 'POST', data })
    }
}

class qs {
    static stringify(obj, prefix = '') {
        const pairs = []

        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue

            const value = obj[key]
            const fullKey = prefix ? `${prefix}[${key}]` : key

            if (value === null || value === undefined) {
                pairs.push(encodeURIComponent(fullKey) + '=')
            } else if (typeof value === 'object') {
                pairs.push(stringify(value, fullKey))
            } else {
                pairs.push(
                    encodeURIComponent(fullKey) +
                    '=' +
                    encodeURIComponent(value)
                )
            }
        }

        return pairs.join('&')
    }

    static toObject(str) {
        if (typeof str !== 'string' || str.length === 0) {
            return {}
        }
        str = str.replace(/&/g, ',').replace(/=/g, ':')
        const obj = {}
        const pairs = str.split(',')
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split(':')
            obj[pair[0]] = pair[1]
        }
        return obj
    }
}

