import { useState } from "react";
import { type BomModel } from "../../../util/Models";
import { createPortal } from "react-dom";
import { WorkOrderForm } from "./WorkOrderForm";
import { recordImageSrc } from "../../../util/recordImage";
import RecordHeaderCard from "../../../components/RecordHeaderCard";

const ACTION_BUTTON = "px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-all shadow-md w-full lg:w-auto text-center";

/** The BOM page's header: the assembly, "Create Work Order" and its Onshape link. */
const MainBomDataUI: React.FC<{ bom: BomModel }> = ({ bom }) => {
  const [isCreatingWO, setCreatingWO] = useState(false);
  // While the work order is being created, a click on the backdrop doesn't close the form.
  const [isCreatingBusy, setCreatingBusy] = useState(false);

  const resolvedBomId = bom.id || (bom as any)._id;

  return (
    <div>
      <RecordHeaderCard
        imageSrc={recordImageSrc(bom)}
        imageAlt={bom.name || "BOM Thumbnail"}
        title={bom.name || "Unnamed Assembly"}
        description={bom.description}
        facts={[
          { label: "Catalog No", value: bom.catalogNumber || "N/A" },
          { label: "Engineer", value: bom.engineer || "N/A" },
        ]}
        actions={
          <>
            <button onClick={() => setCreatingWO(true)} className={ACTION_BUTTON}>
              Create Work Order
            </button>
            {bom.onshapeURL && (
              <a href={bom.onshapeURL} target="_blank" rel="noopener noreferrer" className={ACTION_BUTTON}>
                Open Onshape CAD
              </a>
            )}
          </>
        }
        comments={bom.comments}
      />

      {isCreatingWO && createPortal(
        <div
          onClick={() => { if (!isCreatingBusy) setCreatingWO(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <WorkOrderForm
              bomId={resolvedBomId}
              avatarID={bom.avatarID}
              onCancel={() => setCreatingWO(false)}
              onBusyChange={setCreatingBusy}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default MainBomDataUI;
