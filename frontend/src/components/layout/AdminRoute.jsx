import {useEffect,useState} from 'react';
import {useAuth} from '../../context/AuthContext.jsx';
import {getCurrentUser} from '../../api/auth.api.js';
import ProtectedRoute from './ProtectedRoute.jsx';
import LoadingBlock from '../ui/LoadingBlock.jsx';
import ErrorState from '../ui/ErrorState.jsx';
export default function AdminRoute({children}){
 const {user,setUser}=useAuth();const [state,setState]=useState({loading:true,error:null});const [revision,setRevision]=useState(0);
 useEffect(()=>{
   let active=true;
   setState({loading:true,error:null});
   getCurrentUser().then(result=>{if(active){setUser(result.data);setState({loading:false,error:null});}})
    .catch(error=>{if(active)setState({loading:false,error});});
   return()=>{active=false;};
 },[user?.id,revision,setUser]);
 return <ProtectedRoute>{state.loading?<LoadingBlock label="Checking review permissions"/>:
   state.error?<ErrorState message={state.error.message} onRetry={()=>setRevision(r=>r+1)}/>:
   user?.role!=='admin'?<div className="page-shell"><h1>Access restricted</h1><p>This area is available to authorized reviewers.</p></div>:children}</ProtectedRoute>;
}
