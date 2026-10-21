# Custom Flag Display

一个 Discourse 主题组件：在用户点击「举报」打开举报弹窗时，从举报类型列表中**移除**指定的举报类型。

- 提供两个设置项，默认均为空：
  - `own_posts_hidden_flag_types`：举报**自己的帖子**时隐藏的举报类型
  - `other_posts_hidden_flag_types`：举报**他人的帖子**时隐藏的举报类型

## 设置项

| 设置项 | 含义 | 默认值 |
| --- | --- | --- |
| `own_posts_hidden_flag_types` | 举报自己的帖子时，从举报弹窗中隐藏这些举报类型 | 空 |
| `other_posts_hidden_flag_types` | 举报他人的帖子时，从举报弹窗中隐藏这些举报类型 | 空 |

### 填写项

内置的 6 种举报类型已放入下拉列表，可直接选择：

`spam`、`off_topic`、`inappropriate`、`notify_user`、`notify_moderators`、`illegal`

自定义举报类型仍可手动输入，支持以下任意一种标识：

1. 举报类型的 **key**：后台「管理 → 举报」中该类型的 key，形如 `custom_vote`
2. 自定义举报类型 key 去掉 `custom_` 前缀后的部分，例如 `custom_vote` 可以写成 `vote`
3. 该举报类型在后台显示的**名称**，例如 `Vote` 或「投票」

> 特别说明：Discourse 的主题 `list` 设置本身不支持 `choices`，下拉列表里的内置类型由组件的前端脚本注入到后台设置界面；仅影响后台 UI。如果后台界面结构调整，该项增强会自动失效（只是没有预置选项），不会影响组件其他功能。
