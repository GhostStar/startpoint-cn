import { Layout, Menu } from "antd"
import {
    DashboardOutlined,
    TeamOutlined,
    MailOutlined,
    ExperimentOutlined
} from "@ant-design/icons"
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom"
import Dashboard from "./pages/Dashboard"
import Accounts from "./pages/Accounts"
import PlayerDetail from "./pages/PlayerDetail"
import Mail from "./pages/Mail"
import Seeds from "./pages/Seeds"

const { Sider, Content, Header } = Layout

const menuItems = [
    { key: "/", icon: <DashboardOutlined />, label: "首页" },
    { key: "/accounts", icon: <TeamOutlined />, label: "账号 / 存档" },
    { key: "/mail", icon: <MailOutlined />, label: "邮件群发" },
    { key: "/seeds", icon: <ExperimentOutlined />, label: "种子管理" }
]

export default function App() {
    const navigate = useNavigate()
    const location = useLocation()
    const selected = menuItems.find(m => m.key !== "/" && location.pathname.startsWith(m.key))?.key
        ?? "/"

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <Sider theme="light" breakpoint="lg" collapsedWidth={64}>
                <div style={{ padding: 16, fontWeight: 700, fontSize: 18 }}>Starpoint</div>
                <Menu
                    mode="inline"
                    selectedKeys={[selected]}
                    items={menuItems}
                    onClick={e => navigate(e.key)}
                />
            </Sider>
            <Layout>
                <Header style={{ background: "transparent", padding: "0 24px", fontSize: 16 }}>
                    管理后台
                </Header>
                <Content style={{ margin: 24 }}>
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/accounts" element={<Accounts />} />
                        <Route path="/players/:playerId" element={<PlayerDetail />} />
                        <Route path="/mail" element={<Mail />} />
                        <Route path="/seeds" element={<Seeds />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Content>
            </Layout>
        </Layout>
    )
}
