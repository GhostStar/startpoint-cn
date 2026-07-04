import { Card, Form, Select, InputNumber, Input, Button, message, Alert, Typography } from "antd"
import { useMutation } from "@tanstack/react-query"
import { apiPost } from "../api/client"

const { TextArea } = Input
const { Text } = Typography

// 附件类型对应旧 mail.html 下拉；needsId=需 type_id，singleOnly=每封仅 1 个
const MAIL_TYPES = [
    { value: 1, label: "道具 (Item)", needsId: true },
    { value: 3, label: "付费星导石 (Paid Vmoney)" },
    { value: 4, label: "免费星导石 (Free Vmoney)" },
    { value: 5, label: "角色 (Character)", needsId: true, singleOnly: true },
    { value: 6, label: "装备 (Equipment)", needsId: true, singleOnly: true },
    { value: 7, label: "星之碎片 (Star Crumb)" },
    { value: 8, label: "法力 (Mana)" },
    { value: 9, label: "经验池 (Exp Pool)" },
    { value: 10, label: "羁绊之证 (Bond Token)" },
    { value: 11, label: "Boss Boost 点" },
    { value: 12, label: "Boost 点" },
    { value: 15, label: "Rank 点" },
]

const MAX_INT = 2147483647

interface SendResult { ok: boolean; sent: number }

export default function Mail() {
    const [form] = Form.useForm()
    const type = Form.useWatch("type", form)
    const meta = MAIL_TYPES.find(t => t.value === type)
    const needsId = !!meta?.needsId
    const singleOnly = !!meta?.singleOnly

    const send = useMutation({
        mutationFn: (v: any) => apiPost<SendResult>("/api/mail/send", {
            type: String(v.type),
            type_id: v.type_id != null ? String(v.type_id) : "",
            number: String(v.number ?? 1),
            subject: v.subject ?? "",
            description: v.description ?? "",
        }),
        onSuccess: (r) => { message.success(`已向 ${r.sent} 个角色发送邮件`); form.resetFields() },
        onError: (e: Error) => message.error(e.message),
    })

    return (
        <Card title="邮件群发" style={{ maxWidth: 640 }}>
            <Alert type="warning" showIcon style={{ marginBottom: 16 }}
                message="将向服务器上所有账号的所有存档发送同一封邮件" />
            <Form form={form} layout="vertical" onFinish={v => send.mutate(v)} initialValues={{ number: 1 }}>
                <Form.Item name="type" label="附件类型" rules={[{ required: true, message: "请选择附件类型" }]}>
                    <Select
                        placeholder="-- 请选择附件类型 --"
                        options={MAIL_TYPES.map(t => ({ value: t.value, label: t.label }))}
                        onChange={() => {
                            const m = MAIL_TYPES.find(t => t.value === form.getFieldValue("type"))
                            if (m?.singleOnly) form.setFieldValue("number", 1)
                            form.validateFields(["type_id"]).catch(() => {})
                        }}
                    />
                </Form.Item>

                <Form.Item
                    name="type_id"
                    label="附件 ID (type_id)"
                    rules={needsId ? [{ required: true, message: "此类型需填写附件 ID" }] : []}
                    extra={needsId
                        ? "道具=道具ID / 角色=6位 business code / 装备=7位 ID，发送前会校验 CDN 数据"
                        : "此附件类型无需填写附件 ID"}
                >
                    <InputNumber style={{ width: "100%" }} min={1} max={MAX_INT} disabled={!needsId}
                        placeholder="道具 ID / 角色 code / 装备 ID" />
                </Form.Item>

                <Form.Item name="number" label="数量" rules={[{ required: true, message: "请输入数量" }]}
                    extra={singleOnly ? "角色 / 装备每封邮件仅可发送 1 个" : undefined}>
                    <InputNumber style={{ width: "100%" }} min={1} max={MAX_INT} disabled={singleOnly} />
                </Form.Item>

                <Form.Item name="subject" label="标题（可选）">
                    <Input maxLength={64} showCount placeholder="留空使用游戏默认" />
                </Form.Item>

                <Form.Item name="description" label="正文（可选）">
                    <TextArea rows={3} maxLength={512} showCount placeholder="留空使用游戏默认" />
                </Form.Item>

                <Form.Item>
                    <Button type="primary" htmlType="submit" loading={send.isPending}>发送</Button>
                    <Text type="secondary" style={{ marginLeft: 12 }}>发送后无法撤回，请确认附件 ID</Text>
                </Form.Item>
            </Form>
        </Card>
    )
}
