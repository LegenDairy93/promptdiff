import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"PromptDiff — See what changed. Gate what ships.",description:"A live behavioral change review for prompts and models."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}