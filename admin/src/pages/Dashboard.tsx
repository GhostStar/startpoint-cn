import { useState } from "react"
import { Card, Statistic, Space, Alert, DatePicker, Button, message, Typography, Row, Col, Divider } from "antd"
import { TeamOutlined, MailOutlined, ExperimentOutlined, ReloadOutlined } from "@ant-design/icons"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import type { Dayjs } from "dayjs"
import { apiGet } from "../api/client"

interface ServerTime {
    servertime: number
    date: string
    isCustom: boolean
}

// GET /api/server/accounts 返回的账号行（与「账号 / 存档」页共用类型与缓存）
interface AccountRow {
    id: number
    saveCount: number
    defaultPlayerId: number | null
    defaultPlayerName: string | null
    playerIds: number[]
}

// GET /api/server/currentTime 返回 { servertime, date, isCustom }
export default function Dashboard() {
    const qc = useQueryClient()
    const navigate = useNavigate()
    const [picked, setPicked] = useState<Dayjs | null>(null)

    const { data, isError, isLoading } = useQuery({
        queryKey: ["serverTime"],
        queryFn: () => apiGet<ServerTime>("/api/server/currentTime"),
        refetchInterval: 30_000
    })

    // 概览统计：复用账号列表（与「账号 / 存档」页共用 ["accounts"] 缓存）。
    // 本模型下每个存档即一条玩家记录，故存档总数 = 玩家总数。
    const { data: accounts = [], isLoading: accountsLoading, isError: accountsError, isFetching: accountsFetching } = useQuery({
        queryKey: ["accounts"],
        queryFn: () => apiGet<AccountRow[]>("/api/server/accounts"),
    })

    const accountCount = accounts.length
    const saveCount = accounts.reduce((sum, a) => sum + a.saveCount, 0)
    const avgSaves = accountCount ? saveCount / accountCount : 0

    const timeText = isLoading
        ? "加载中…"
        : isError || !data
            ? "接口不可用"
            : new Date(data.date).toLocaleString("zh-CN")

    const setTime = useMutation({
        mutationFn: (t: Dayjs) =>
            apiGet<ServerTime>(`/api/server/time?time=${encodeURIComponent(t.format("YYYY-MM-DDTHH:mm:ss"))}`),
        onSuccess: () => { message.success("服务器时间已设置"); qc.invalidateQueries({ queryKey: ["serverTime"] }) },
        onError: (e: Error) => message.error(e.message),
    })

    const resetTime = useMutation({
        mutationFn: () => apiGet<ServerTime>("/api/server/resetTime"),
        onSuccess: () => { message.success("已重置为系统时间"); qc.invalidateQueries({ queryKey: ["serverTime"] }) },
        onError: (e: Error) => message.error(e.message),
    })

    return (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Alert
                type="info"
                showIcon
                message="新版管理后台（开发中）"
                description="旧版页面仍在 / 正常运行，功能迁移完成前两者并存。"
            />
            <Card
                title="概览统计"
                style={{ maxWidth: 720 }}
                extra={
                    <Button
                        type="text"
                        icon={<ReloadOutlined />}
                        loading={accountsFetching}
                        onClick={() => qc.invalidateQueries({ queryKey: ["accounts"] })}
                    >
                        刷新
                    </Button>
                }
            >
                {accountsError ? (
                    <Alert
                        type="error"
                        showIcon
                        message="概览数据加载失败"
                        description="接口 /api/server/accounts 不可用。"
                    />
                ) : (
                    <Row gutter={[16, 16]}>
                        <Col xs={12} sm={8}>
                            <Statistic title="账号总数" value={accountCount} loading={accountsLoading} />
                        </Col>
                        <Col xs={12} sm={8}>
                            <Statistic title="存档总数（玩家）" value={saveCount} loading={accountsLoading} />
                        </Col>
                        <Col xs={12} sm={8}>
                            <Statistic title="平均每账号存档" value={avgSaves} precision={1} loading={accountsLoading} />
                        </Col>
                    </Row>
                )}
                <Divider style={{ margin: "16px 0" }} />
                <Space wrap>
                    <Button icon={<TeamOutlined />} onClick={() => navigate("/accounts")}>账号 / 存档</Button>
                    <Button icon={<MailOutlined />} onClick={() => navigate("/mail")}>邮件群发</Button>
                    <Button icon={<ExperimentOutlined />} onClick={() => navigate("/seeds")}>种子管理</Button>
                </Space>
            </Card>
            <Card title="服务器状态" style={{ maxWidth: 520 }}>
                <Statistic
                    title="服务器时间"
                    value={timeText}
                    suffix={data?.isCustom ? "（自定义）" : undefined}
                />
            </Card>
            <Card title="时间控制" style={{ maxWidth: 520 }}>
                <Space direction="vertical" style={{ width: "100%" }}>
                    <Space wrap>
                        <DatePicker
                            showTime
                            value={picked}
                            onChange={setPicked}
                            placeholder="选择服务器时间 (UTC)"
                            format="YYYY-MM-DD HH:mm:ss"
                        />
                        <Button type="primary" disabled={!picked} loading={setTime.isPending}
                            onClick={() => picked && setTime.mutate(picked)}>
                            设置时间
                        </Button>
                        <Button loading={resetTime.isPending} onClick={() => resetTime.mutate()}>
                            重置为系统时间
                        </Button>
                    </Space>
                    <Typography.Text type="secondary">
                        所选时间按 UTC 解释；重置后跟随真实系统时间。
                    </Typography.Text>
                </Space>
            </Card>
        </Space>
    )
}
