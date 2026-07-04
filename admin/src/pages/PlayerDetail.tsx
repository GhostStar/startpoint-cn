import { Card, Empty } from "antd"
import { useParams } from "react-router-dom"

// M2: 玩家详情（对应旧 player.html + /api/player/*）
export default function PlayerDetail() {
    const { playerId } = useParams()
    return (
        <Card title={`玩家 #${playerId}`}>
            <Empty description="M2 迁移中：资源、角色/道具/装备、关卡进度、账号字段编辑、工具操作" />
        </Card>
    )
}
