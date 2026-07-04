import { useState } from "react"
import { Card, Statistic, Space, Alert, DatePicker, Button, message, Typography } from "antd"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Dayjs } from "dayjs"
import { apiGet } from "../api/client"

interface ServerTime {
    servertime: number
    date: string
    isCustom: boolean
}

// GET /api/server/currentTime 返回 { servertime, date, isCustom }
export default function Dashboard() {
    const qc = useQueryClient()
    const [picked, setPicked] = useState<Dayjs | null>(null)

    const { data, isError, isLoading } = useQuery({
        queryKey: ["serverTime"],
        queryFn: () => apiGet<ServerTime>("/api/server/currentTime"),
        refetchInterval: 30_000
    })

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
