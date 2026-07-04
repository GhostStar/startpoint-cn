import { Card, Empty } from "antd"

// M3: 邮件群发（对应旧 mail.html + POST /api/mail/send）
export default function Mail() {
    return (
        <Card title="邮件群发">
            <Empty description="M3 迁移中：标题/正文/附件奖励、发送对象选择" />
        </Card>
    )
}
