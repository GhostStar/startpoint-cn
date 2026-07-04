import { Card, Statistic, Space, Alert } from "antd"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "../api/client"

// GET /api/server/currentTime 返回 ISO 字符串或 JSON，M1 阶段只做展示验证链路
export default function Dashboard() {
    const { data, isError, isLoading } = useQuery({
        queryKey: ["serverTime"],
        queryFn: () => apiGet<string>("/api/server/currentTime"),
        refetchInterval: 30_000
    })

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
                    value={isLoading ? "加载中…" : isError ? "接口不可用" : String(data)}
                />
            </Card>
        </Space>
    )
}
