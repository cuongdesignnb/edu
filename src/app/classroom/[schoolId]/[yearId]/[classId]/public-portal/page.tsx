"use client";
import {ClassHeader} from '@/features/classroom/context';
import {PublicPortalSettings} from '@/features/class-comms/public-portal-settings';
export default function Page(){return <div className="page"><ClassHeader title="Cổng lớp công khai & QR"/><div className="card space-y-3 p-5"><p>Chọn các mục công khai, quản lý đường dẫn lớp và tải QR.</p><PublicPortalSettings/></div></div>;}
