import { Card, Statistic, Space, Alert } from "antd"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"

interface ServerTime {
    servertime: number
    date: string
    isCustom: boolean
}

// GET /api/server/currentTime 返回 { servertime, date, isCustom }
export default function Dashboard() {
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

    return (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Alert
                type="info"
                showIcon
                message="新版管理后台（开发中）"
                description="旧版页面仍在 / 正常运行，功能迁移完成前两者并存。"
            />
            <Card title="服务器状态" style={{ maxWidth: 480 }}>
                <Statistic
                    title="服务器时间"
                    value={timeText}
                    suffix={data?.isCustom ? "（自定义）" : undefined}
                />
            </Card>
        </Space>
    )
}
