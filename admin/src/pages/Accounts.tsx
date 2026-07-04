import { Card, Empty } from "antd"

// M2: 账号/存档管理（对应旧 players.html + /api/server/*）
export default function Accounts() {
    return (
        <Card title="账号 / 存档管理">
            <Empty description="M2 迁移中：账号列表、存档新建/克隆/改名/删除、生效存档切换" />
        </Card>
    )
}
